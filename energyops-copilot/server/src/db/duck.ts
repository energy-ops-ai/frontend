// DuckDB layer. Auto-discovers every CSV in the dataset directory and exposes
// each as a queryable view (dataset-agnostic: whatever files exist become
// tables). Runs the agent's read-only SQL with a hard row cap.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(SERVER_ROOT, process.env.DATA_DIR)
  : path.resolve(SERVER_ROOT, '../../energyops_copilot_sample_dataset');

const toPosix = (p: string) => p.split(path.sep).join('/');
const viewName = (file: string) =>
  path.basename(file, '.csv').replace(/[^a-zA-Z0-9_]/g, '_');

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface Duck {
  /** Agent-facing: validated read-only SELECT/WITH only, row-capped. */
  query(sql: string, maxRows?: number): Promise<QueryResult>;
  /** Internal/trusted: runs any statement (e.g. DESCRIBE) unvalidated. */
  raw(sql: string, maxRows?: number): Promise<QueryResult>;
  tables(): string[];
  dataDir: string;
}

// DuckDB returns temporal / bigint values as wrapper objects. Flatten them to
// plain JSON-friendly values so the agent and the UI see strings/numbers.
function normalizeValue(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('micros' in o) return new Date(Number(o.micros) / 1000).toISOString();
    if ('days' in o)
      return new Date(Number(o.days) * 86400000).toISOString().slice(0, 10);
    if (Array.isArray(v)) return v.map(normalizeValue);
  }
  return v;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) out[k] = normalizeValue(val);
  return out;
}

const READ_ONLY = /^\s*(select|with)\b/i;
const FORBIDDEN =
  /\b(insert|update|delete|drop|create|alter|attach|detach|copy|pragma|install|load|export|set|call|truncate)\b/i;

let duckPromise: Promise<Duck> | null = null;

async function init(): Promise<Duck> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn: DuckDBConnection = await instance.connect();

  const csvFiles = readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
  const tableNames: string[] = [];
  for (const file of csvFiles) {
    const name = viewName(file);
    const abs = toPosix(path.join(DATA_DIR, file));
    await conn.run(
      `CREATE VIEW ${name} AS SELECT * FROM read_csv_auto('${abs}', sample_size=-1)`
    );
    tableNames.push(name);
  }
  console.log(
    `DuckDB ready — ${tableNames.length} tables from ${path.basename(DATA_DIR)}: ${tableNames.join(', ')}`
  );

  // Trusted execution path: no validation, used for our own DESCRIBE/metadata.
  async function raw(sql: string, maxRows = 1000): Promise<QueryResult> {
    const wrapped = `SELECT * FROM (${sql.trim().replace(/;\s*$/, '')}) AS _q LIMIT ${maxRows + 1}`;
    const reader = await conn.runAndReadAll(wrapped);
    const allRows = reader.getRowObjects() as Record<string, unknown>[];
    const truncated = allRows.length > maxRows;
    const rows = (truncated ? allRows.slice(0, maxRows) : allRows).map(
      normalizeRow
    );
    return {
      columns: reader.columnNames(),
      rows,
      rowCount: rows.length,
      truncated
    };
  }

  // Agent-facing path: validate it's a single read-only statement, then run.
  async function query(sql: string, maxRows = 1000): Promise<QueryResult> {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    if (!READ_ONLY.test(trimmed)) {
      throw new Error('Only read-only SELECT / WITH queries are allowed.');
    }
    if (FORBIDDEN.test(trimmed)) {
      throw new Error('Query contains a forbidden (write/DDL) keyword.');
    }
    if (trimmed.includes(';')) {
      throw new Error('Only a single statement is allowed (no ";").');
    }
    return raw(trimmed, maxRows);
  }

  return { query, raw, tables: () => [...tableNames], dataDir: DATA_DIR };
}

export function getDuck(): Promise<Duck> {
  if (!duckPromise) duckPromise = init();
  return duckPromise;
}
