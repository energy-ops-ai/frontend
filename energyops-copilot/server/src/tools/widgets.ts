// Widget-rendering tools. Each pushes a typed widget into the operator's
// workspace over SSE and returns the new widget id (so later steps / refinement
// can reference it).

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { broadcast } from '../bus.js';
import { getDuck } from '../db/duck.js';
import { getDiagram } from '../db/topology.js';
import { annotationsBySensor } from '../db/memory.js';
import type {
  ChartSpec,
  DataQualitySpec,
  InsightCardSpec,
  NodeStatus,
  StateSummarySpec,
  TopologySpec,
  Widget
} from '../types.js';

let widgetSeq = 0;
const nextWidgetId = () => `w${++widgetSeq}`;

// Broadcast a widget. If replaceId is given, reuse that id so the frontend
// updates the existing widget in place instead of adding a new one.
function emit(widget: Widget, replaceId?: string): string {
  const id = replaceId ?? widget.id;
  broadcast({ kind: 'widget', widget: { ...widget, id } as Widget });
  return id;
}

const REPLACE_ID_DESC =
  'To UPDATE an existing widget in place (e.g. the user asks to change a chart/topology already shown), pass its id from a previous render result. Omit to create a new widget.';

const STATUS = z.enum(['ok', 'warn', 'alert', 'stale', 'inferred', 'missing']);

const topoNode = z.object({
  id: z.string(),
  label: z.string(),
  sensorId: z.number().optional(),
  role: z.string().optional(),
  branch: z.string().optional(),
  group: z.string().optional(),
  status: STATUS.optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional()
});
const topoEdge = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  emphasis: z.boolean().optional()
});

export const widgetTools = [
  tool(
    'render_topology',
    'Render a topology graph in the workspace. Easiest path: pass `from_diagram` (a diagram id from get_topology) to seed all nodes/edges/positions, then use `highlight` and `statuses` to spotlight or flag nodes. For a simplified/custom view, pass your own `nodes` and `edges` instead. Operator annotations are merged in automatically.',
    {
      title: z.string(),
      from_diagram: z
        .string()
        .optional()
        .describe('Diagram id to seed nodes/edges/positions from'),
      nodes: z
        .array(topoNode)
        .optional()
        .describe('Explicit nodes (override/replace the seeded diagram nodes)'),
      edges: z.array(topoEdge).optional(),
      highlight: z.array(z.string()).optional().describe('Node ids to spotlight'),
      statuses: z
        .array(z.object({ id: z.string(), status: STATUS }))
        .optional()
        .describe('Per-node status flags applied by node id'),
      collapsedGroups: z.array(z.string()).optional(),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      let nodes = input.nodes ?? [];
      let edges = input.edges ?? [];

      if (input.from_diagram !== undefined && input.nodes === undefined) {
        const diagram = getDiagram(input.from_diagram);
        if (diagram) {
          nodes = diagram.nodes.map(n => ({
            id: n.id,
            label: n.label,
            sensorId: n.sensorId,
            role: n.role,
            branch: n.branch,
            unit: n.unit,
            position: n.position
          }));
          if (input.edges === undefined) edges = diagram.edges;
        }
      }

      // Apply status flags by id.
      if (input.statuses?.length) {
        const byId = new Map(input.statuses.map(s => [s.id, s.status]));
        nodes = nodes.map(n =>
          byId.has(n.id) ? { ...n, status: byId.get(n.id) as NodeStatus } : n
        );
      }

      // Merge operator annotations onto nodes by sensorId.
      const annById = annotationsBySensor();
      nodes = nodes.map(n =>
        n.sensorId !== undefined && annById.has(n.sensorId)
          ? { ...n, annotation: annById.get(n.sensorId) }
          : n
      );

      const spec: TopologySpec = {
        title: input.title,
        nodes,
        edges,
        highlight: input.highlight,
        collapsedGroups: input.collapsedGroups
      };
      const id = emit({ id: nextWidgetId(), type: 'topology', spec }, input.replaceId);
      return {
        content: [
          { type: 'text', text: `Rendered topology "${input.title}" (${nodes.length} nodes) as widget ${id}.` }
        ]
      };
    }
  ),

  tool(
    'render_chart',
    'Render a time-series chart in the workspace. Build `x` (ISO timestamps) and one `series` per metric from query_data results. Use role "expected" for baselines and "deviation" for deviation traces. Use markBands to shade a window you found notable.',
    {
      title: z.string(),
      x: z.array(z.string()).describe('X axis labels, usually ISO timestamps'),
      series: z.array(
        z.object({
          name: z.string(),
          data: z.array(z.number().nullable()),
          role: z.enum(['actual', 'expected', 'deviation']).optional()
        })
      ),
      unit: z.string().optional(),
      markBands: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            label: z.string().optional()
          })
        )
        .optional(),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      const spec: ChartSpec = {
        title: input.title,
        x: input.x,
        series: input.series,
        unit: input.unit,
        markBands: input.markBands
      };
      const id = emit({ id: nextWidgetId(), type: 'chart', spec }, input.replaceId);
      return {
        content: [
          { type: 'text', text: `Rendered chart "${input.title}" as widget ${id}.` }
        ]
      };
    }
  ),

  tool(
    'render_chart_from_query',
    'Plot a time-series chart by running SQL SERVER-SIDE — the rows are NOT returned to you, so use THIS (not query_data + render_chart) to chart a full sensor series without pulling thousands of points into context. The query should return an x column (e.g. timestamp) plus one or more numeric value columns, ideally ORDER BY the x column. Map them with xColumn and series. Data is downsampled to maxPoints for rendering.',
    {
      title: z.string(),
      sql: z
        .string()
        .describe('Read-only SELECT returning an x column + numeric value column(s)'),
      xColumn: z.string().describe('Column for the x axis, e.g. "timestamp"'),
      series: z
        .array(
          z.object({
            column: z.string(),
            name: z.string().optional(),
            role: z.enum(['actual', 'expected', 'deviation']).optional()
          })
        )
        .describe('Value columns to plot'),
      unit: z.string().optional(),
      markBands: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            label: z.string().optional()
          })
        )
        .optional(),
      maxPoints: z.number().int().positive().max(2000).optional(),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      const duck = await getDuck();
      try {
        const res = await duck.query(input.sql, 5000);
        let rows = res.rows;
        const maxPoints = input.maxPoints ?? 500;
        let note = '';
        if (rows.length > maxPoints) {
          const stride = Math.ceil(rows.length / maxPoints);
          rows = rows.filter((_, i) => i % stride === 0);
          note = ` (downsampled ${res.rows.length}→${rows.length})`;
        }
        const x = rows.map(r => String(r[input.xColumn] ?? ''));
        const series = input.series.map(s => ({
          name: s.name ?? s.column,
          role: s.role,
          data: rows.map(r => {
            const v = r[s.column];
            return v === null || v === undefined ? null : Number(v);
          })
        }));
        const spec: ChartSpec = {
          title: input.title,
          x,
          series,
          unit: input.unit,
          markBands: input.markBands
        };
        const id = emit({ id: nextWidgetId(), type: 'chart', spec }, input.replaceId);
        return {
          content: [
            {
              type: 'text',
              text: `Rendered chart "${input.title}" (${x.length} points${note}) as widget ${id}.`
            }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Chart query error: ${String(err)}` }],
          isError: true
        };
      }
    }
  ),

  tool(
    'render_state_summary',
    'Render a compact grid of key state values (KPIs) in the workspace — current operating values, setpoints, notable deviations. Set a status per item to colour it.',
    {
      title: z.string(),
      items: z.array(
        z.object({
          label: z.string(),
          value: z.union([z.string(), z.number()]),
          unit: z.string().optional(),
          status: STATUS.optional(),
          delta: z.number().optional()
        })
      ),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      const spec: StateSummarySpec = { title: input.title, items: input.items };
      const id = emit({ id: nextWidgetId(), type: 'state_summary', spec }, input.replaceId);
      return {
        content: [
          { type: 'text', text: `Rendered state summary "${input.title}" as widget ${id}.` }
        ]
      };
    }
  ),

  tool(
    'render_data_quality',
    'Render a data-quality panel listing issues (gaps, stale sensors, inconsistencies) found via scan_data_quality, so the operator can see whether a signal is trustworthy.',
    {
      title: z.string(),
      issues: z.array(
        z.object({
          sensor: z.string(),
          type: z.enum(['gap', 'stale', 'unit_mismatch', 'inconsistent']),
          severity: z.enum(['low', 'med', 'high']),
          detail: z.string()
        })
      ),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      const spec: DataQualitySpec = { title: input.title, issues: input.issues };
      const id = emit({ id: nextWidgetId(), type: 'data_quality', spec }, input.replaceId);
      return {
        content: [
          { type: 'text', text: `Rendered data-quality panel "${input.title}" as widget ${id}.` }
        ]
      };
    }
  ),

  tool(
    'render_insight_card',
    'Render the key operational insight as a reviewable card: a concise summary, supporting evidence, recommended checks/actions, and optionally a "have we seen this before?" question. This is the payoff of an analysis — produce one when you have a conclusion the operator should act on or review. Set severity: info (FYI), watch (keep an eye on), act (needs action).',
    {
      title: z.string(),
      severity: z.enum(['info', 'watch', 'act']),
      summary: z.string(),
      evidence: z.array(z.string()).optional(),
      recommendations: z.array(z.string()).optional(),
      question: z.string().optional(),
      replaceId: z.string().optional().describe(REPLACE_ID_DESC)
    },
    async input => {
      const spec: InsightCardSpec = {
        title: input.title,
        severity: input.severity,
        summary: input.summary,
        evidence: input.evidence,
        recommendations: input.recommendations,
        question: input.question
      };
      const id = emit({ id: nextWidgetId(), type: 'insight_card', spec }, input.replaceId);
      return {
        content: [
          { type: 'text', text: `Rendered insight card "${input.title}" as widget ${id}.` }
        ]
      };
    }
  ),

  tool(
    'remove_widget',
    'Remove a widget from the workspace by its id (from a previous render result). Pass id "all" to clear the entire workspace. Use this to tidy up — e.g. when the operator asks to remove a chart or start fresh.',
    {
      id: z.string().describe('Widget id to remove, or "all" to clear everything')
    },
    async ({ id }) => {
      broadcast({ kind: 'widget_remove', id });
      return {
        content: [
          {
            type: 'text',
            text: id === 'all' ? 'Cleared the workspace.' : `Removed widget ${id}.`
          }
        ]
      };
    }
  )
];
