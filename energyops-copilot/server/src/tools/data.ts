// Data-exploration tools. Schema-driven and scenario-blind: the agent discovers
// the shape of whatever dataset is loaded and queries it freely (read-only SQL),
// then traces structure via the topology helpers.

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { getDuck } from '../db/duck.js';
import {
  getDiagram,
  listDiagrams,
  neighbors,
  type TopoNode
} from '../db/topology.js';
import { annotationsBySensor, getAnnotations } from '../db/memory.js';

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const jsonText = (obj: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }]
});

async function describeDataset() {
  const duck = await getDuck();
  const tables: Record<string, unknown>[] = [];

  for (const name of duck.tables()) {
    const desc = await duck.raw(`DESCRIBE ${q(name)}`, 1000);
    const cols = desc.rows.map(r => ({
      name: String(r.column_name),
      type: String(r.column_type)
    }));

    // Non-null counts per column → how populated each field is.
    const counts = cols.map(c => `count(${q(c.name)}) AS ${q(c.name)}`).join(', ');
    const stat = await duck.raw(
      `SELECT count(*) AS __n, ${counts} FROM ${q(name)}`,
      1
    );
    const row = stat.rows[0] ?? {};
    const n = Number(row.__n ?? 0);
    const columns = cols.map(c => ({
      name: c.name,
      type: c.type,
      populated: n ? `${Math.round((Number(row[c.name] ?? 0) / n) * 100)}%` : 'n/a'
    }));

    // Time range from the first timestamp/date column, if any.
    const timeCol = cols.find(c => /TIMESTAMP|DATE/i.test(c.type));
    let timeRange: { from: unknown; to: unknown } | undefined;
    if (timeCol) {
      const tr = await duck.raw(
        `SELECT min(${q(timeCol.name)}) AS f, max(${q(timeCol.name)}) AS t FROM ${q(name)}`,
        1
      );
      timeRange = { from: tr.rows[0]?.f, to: tr.rows[0]?.t };
    }

    tables.push({ table: name, rows: n, columns, timeRange });
  }

  return {
    dataDir: duck.dataDir,
    tables,
    diagrams: listDiagrams(),
    annotations: getAnnotations().length,
    note: 'Schema reflects the currently loaded dataset. Query any table with query_data. Do not assume a specific scenario; rank deviations / inspect ranges to find what is unusual.'
  };
}

function enrichNodes(nodes: TopoNode[]) {
  const ann = annotationsBySensor();
  return nodes.map(n => ({
    ...n,
    annotation:
      n.sensorId !== undefined ? ann.get(n.sensorId) : undefined
  }));
}

export const dataTools = [
  tool(
    'describe_dataset',
    'Inspect the currently loaded dataset: tables, columns (with type and how populated each is), row counts, time ranges, available topology diagrams, and annotation count. Call this first to learn what you can query — never assume a specific scenario or schema.',
    {},
    async () => jsonText(await describeDataset())
  ),

  tool(
    'query_data',
    'Run a read-only SQL query (DuckDB) for INSPECTION and AGGREGATION — e.g. rank sensors by deviation, compute stats, sample a few rows. Do NOT pull long raw series with this (it wastes context and gets truncated); to plot a full series use render_chart_from_query instead, which runs server-side. Results are row- and size-capped.',
    {
      sql: z.string().describe('A single read-only SELECT/WITH statement'),
      maxRows: z
        .number()
        .int()
        .positive()
        .max(1000)
        .optional()
        .describe('Row cap (default 200). Prefer aggregation over large row counts.')
    },
    async ({ sql, maxRows }) => {
      const duck = await getDuck();
      try {
        const res = await duck.query(sql, maxRows ?? 200);
        // Compact output + hard character budget so a wide/long result can't
        // blow past the SDK's tool-result token limit.
        const MAX_CHARS = 40000;
        let rows = res.rows;
        let truncated = res.truncated;
        let text = JSON.stringify({ columns: res.columns, rowCount: rows.length, truncated, rows });
        if (text.length > MAX_CHARS) {
          const keep = Math.max(1, Math.floor((rows.length * MAX_CHARS) / text.length));
          rows = rows.slice(0, keep);
          truncated = true;
          text = JSON.stringify({
            columns: res.columns,
            rowCount: rows.length,
            truncated,
            note: 'Result trimmed to fit context. Aggregate in SQL, or use render_chart_from_query to plot a full series without returning rows.',
            rows
          });
        }
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Query error: ${String(err)}` }],
          isError: true
        };
      }
    }
  ),

  tool(
    'get_topology',
    'Get a topology diagram that ships with the dataset (nodes with id/label/sensorId/role/branch/position, plus edges). Omit diagram_id for the default. Operator annotations are merged onto nodes. Pass the result to render_topology to visualise it.',
    {
      diagram_id: z.string().optional()
    },
    async ({ diagram_id }) => {
      const diagram = getDiagram(diagram_id);
      if (!diagram) {
        return jsonText({ error: 'No diagram found', available: listDiagrams() });
      }
      return jsonText({
        id: diagram.id,
        name: diagram.name,
        nodes: enrichNodes(diagram.nodes),
        edges: diagram.edges,
        available: listDiagrams()
      });
    }
  ),

  tool(
    'get_neighbors',
    'Trace the topology around a node: upstream sources, downstream consumers, or both, up to a depth. Use this to follow energy flow and find what is up/downstream of a sensor of interest.',
    {
      node_id: z.string(),
      diagram_id: z.string().optional(),
      depth: z.number().int().positive().max(6).optional(),
      direction: z.enum(['up', 'down', 'both']).optional()
    },
    async ({ node_id, diagram_id, depth, direction }) => {
      const sub = neighbors(diagram_id, node_id, depth ?? 1, direction ?? 'both');
      return jsonText({
        node_id,
        nodes: enrichNodes(sub.nodes),
        edges: sub.edges
      });
    }
  )
];
