// Widget-rendering tools. Each pushes a typed widget into the operator's
// workspace over SSE and returns the new widget id (so later steps / refinement
// can reference it).

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { broadcast } from '../bus.js';
import { getDiagram } from '../db/topology.js';
import { annotationsBySensor } from '../db/memory.js';
import type {
  ChartSpec,
  NodeStatus,
  StateSummarySpec,
  TopologySpec,
  Widget
} from '../types.js';

let widgetSeq = 0;
const nextWidgetId = () => `w${++widgetSeq}`;

function emit(widget: Widget): string {
  broadcast({ kind: 'widget', widget });
  return widget.id;
}

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
      collapsedGroups: z.array(z.string()).optional()
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
      const id = emit({ id: nextWidgetId(), type: 'topology', spec });
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
        .optional()
    },
    async input => {
      const spec: ChartSpec = {
        title: input.title,
        x: input.x,
        series: input.series,
        unit: input.unit,
        markBands: input.markBands
      };
      const id = emit({ id: nextWidgetId(), type: 'chart', spec });
      return {
        content: [
          { type: 'text', text: `Rendered chart "${input.title}" as widget ${id}.` }
        ]
      };
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
      )
    },
    async input => {
      const spec: StateSummarySpec = { title: input.title, items: input.items };
      const id = emit({ id: nextWidgetId(), type: 'state_summary', spec });
      return {
        content: [
          { type: 'text', text: `Rendered state summary "${input.title}" as widget ${id}.` }
        ]
      };
    }
  )
];
