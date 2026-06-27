// Persistent operator knowledge (SQLite). P1 sets up the annotations table (the
// descriptive layer); notes + decisions tables arrive in P3.

import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const DB_PATH = fileURLToPath(new URL('../../memory.db', import.meta.url));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS annotations (
    target_kind TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    text        TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (target_kind, target_id)
  );
`);

export type AnnotationKind =
  | 'sensor'
  | 'node'
  | 'edge'
  | 'subsystem'
  | 'dataset'
  | 'widget';

export interface Annotation {
  target_kind: AnnotationKind;
  target_id: string;
  text: string;
  updated_at: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO annotations (target_kind, target_id, text, updated_at)
  VALUES (@target_kind, @target_id, @text, @updated_at)
  ON CONFLICT(target_kind, target_id)
  DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at
`);

export function setAnnotation(
  kind: AnnotationKind,
  id: string,
  text: string
): Annotation {
  const row: Annotation = {
    target_kind: kind,
    target_id: String(id),
    text,
    updated_at: new Date().toISOString()
  };
  upsertStmt.run(row);
  return row;
}

export function getAnnotations(filter?: {
  kind?: AnnotationKind;
  id?: string;
}): Annotation[] {
  if (filter?.kind && filter?.id) {
    return db
      .prepare(
        'SELECT * FROM annotations WHERE target_kind = ? AND target_id = ?'
      )
      .all(filter.kind, String(filter.id)) as Annotation[];
  }
  if (filter?.kind) {
    return db
      .prepare('SELECT * FROM annotations WHERE target_kind = ?')
      .all(filter.kind) as Annotation[];
  }
  return db
    .prepare('SELECT * FROM annotations ORDER BY updated_at DESC')
    .all() as Annotation[];
}

/** Map of sensorId -> annotation text, for enriching topology nodes. */
export function annotationsBySensor(): Map<number, string> {
  const rows = getAnnotations({ kind: 'sensor' });
  const map = new Map<number, string>();
  for (const r of rows) map.set(Number(r.target_id), r.text);
  return map;
}
