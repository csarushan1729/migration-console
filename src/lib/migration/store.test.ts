import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import type { Job } from "./types.ts";

// Exercise the store against a throwaway on-disk file rather than :memory:,
// so the "does it survive a process restart" test is real: we close the
// handle and open a brand new one against the same path.
const dbPath = `/tmp/meridian-store-test-${process.pid}-${Date.now()}.db`;
process.env.MERIDIAN_DB_PATH = dbPath;

function makeJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id ?? `mrd_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    clientName: "Apex Manufacturing",
    engagement: "Employee master · cutover to Darwinbox",
    targetSystem: "Darwinbox Employee Master",
    createdAt: Date.now(),
    status: "running",
    pipeline: ["ingest", "profile", "map", "ai_assist", "transform", "reconcile", "validate", "summarize"],
    pipelineIndex: 0,
    files: [],
    columns: [],
    mappings: [],
    records: [],
    escalations: [],
    events: [],
    audit: [],
    deltaRules: [],
    pushCalls: [],
    metrics: {
      sourceRows: 0,
      uniquePeople: 0,
      autoMapped: 0,
      escalations: 0,
      autoTransforms: 0,
      pushed: 0,
      failed: 0,
    },
    ...overrides,
  };
}

describe("SQLite job store", () => {
  before(async () => {
    const { _resetForTests } = await import("./store.ts");
    _resetForTests();
  });

  beforeEach(async () => {
    const { _resetForTests } = await import("./store.ts");
    _resetForTests();
  });

  it("round-trips a saved job with nested fields intact", async () => {
    const { saveJob, getJob } = await import("./store.ts");
    const job = makeJob({
      records: [
        {
          id: "rec_1",
          employeeNumber: "1001",
          fields: { firstName: { raw: "RAJESH", value: "Rajesh", confidence: 0.95, lineage: [] } },
          sourceRowIds: ["hris.csv:0"],
          flags: [],
          excluded: false,
        },
      ],
    });
    saveJob(job);
    const loaded = getJob(job.id);
    assert.ok(loaded);
    assert.equal(loaded?.clientName, "Apex Manufacturing");
    assert.equal(loaded?.records[0]?.employeeNumber, "1001");
    assert.equal(loaded?.records[0]?.fields.firstName?.value, "Rajesh");
  });

  it("returns undefined for a job that was never saved", async () => {
    const { getJob } = await import("./store.ts");
    assert.equal(getJob("does-not-exist"), undefined);
  });

  it("overwrites an existing job on a second save rather than duplicating it", async () => {
    const { saveJob, getJob, listJobs } = await import("./store.ts");
    const job = makeJob({ status: "running" });
    saveJob(job);
    job.status = "complete";
    job.metrics.pushed = 14;
    saveJob(job);

    const loaded = getJob(job.id);
    assert.equal(loaded?.status, "complete");
    assert.equal(loaded?.metrics.pushed, 14);
    assert.equal(listJobs().filter((j) => j.id === job.id).length, 1);
  });

  it("lists jobs newest-first", async () => {
    const { saveJob, listJobs } = await import("./store.ts");
    const older = makeJob({ createdAt: 1000, clientName: "Older Co" });
    const newer = makeJob({ createdAt: 2000, clientName: "Newer Co" });
    saveJob(older);
    saveJob(newer);
    const list = listJobs();
    const idxOlder = list.findIndex((j) => j.id === older.id);
    const idxNewer = list.findIndex((j) => j.id === newer.id);
    assert.ok(idxNewer < idxOlder);
  });

  it("caps the listing at 12 most recent jobs", async () => {
    const { saveJob, listJobs } = await import("./store.ts");
    for (let i = 0; i < 15; i++) {
      saveJob(makeJob({ createdAt: i }));
    }
    assert.equal(listJobs().length, 12);
  });

  it("survives closing and reopening the database file (simulated restart)", async () => {
    const { saveJob, _resetForTests } = await import("./store.ts");
    const job = makeJob({ clientName: "Persistent Co" });
    saveJob(job);
    _resetForTests();

    // Re-import isn't needed (module state, not module cache, was reset) —
    // calling getJob again opens a fresh DatabaseSync against the same file.
    const { getJob } = await import("./store.ts");
    const reloaded = getJob(job.id);
    assert.ok(reloaded);
    assert.equal(reloaded?.clientName, "Persistent Co");
  });
});
