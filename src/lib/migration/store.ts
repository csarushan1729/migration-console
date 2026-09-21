import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Job, JobSnapshot } from "./types.ts";

/**
 * Job state now survives a server restart. Each job is stored as a single
 * JSON blob (id / clientName / status / createdAt are also broken out into
 * their own columns purely so `listJobs` can sort and page in SQL instead of
 * loading every job into memory).
 *
 * `MERIDIAN_DB_PATH` overrides the file location — set it to a path on a
 * persistent volume in production. It defaults to `./data/meridian.db`,
 * created on first write. Pass `:memory:` to opt back into ephemeral state
 * (handy for tests).
 */
const DB_PATH = process.env.MERIDIAN_DB_PATH?.trim() || "./data/meridian.db";

let db: DatabaseSync | undefined;

function getDb(): DatabaseSync {
  if (db) return db;

  if (DB_PATH !== ":memory:") {
    const dir = dirname(resolve(DB_PATH));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);
  `);
  return db;
}

export function saveJob(job: Job): Job {
  getDb()
    .prepare(
      `INSERT INTO jobs (id, client_name, status, created_at, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         client_name = excluded.client_name,
         status = excluded.status,
         data = excluded.data`,
    )
    .run(job.id, job.clientName, job.status, job.createdAt, JSON.stringify(job));
  return job;
}

export function getJob(id: string): Job | undefined {
  const row = getDb().prepare(`SELECT data FROM jobs WHERE id = ?`).get(id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Job) : undefined;
}

export function snapshot(job: Job): JobSnapshot {
  return {
    ...job,
    files: job.files.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      headers: f.headers,
      rowCount: f.rowCount,
    })),
  };
}

export function listJobs(): { id: string; clientName: string; status: Job["status"]; createdAt: number }[] {
  const rows = getDb()
    .prepare(`SELECT id, client_name, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 12`)
    .all() as { id: string; client_name: string; status: Job["status"]; created_at: number }[];
  return rows.map((r) => ({
    id: r.id,
    clientName: r.client_name,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Test-only: close and forget the current handle so a fresh :memory: db can be opened. */
export function _resetForTests(): void {
  db?.close();
  db = undefined;
}
