import type { Job, PushCall, UnifiedRecord } from "./types.ts";
import { uid, now } from "./ids.ts";
import { TARGET_FIELDS } from "./schema.ts";

type Stored = {
  batchId: string;
  employees: Map<string, Record<string, string | number | null>>;
  failedOnce: Set<string>;
};

const TARGET = new Map<string, Stored>();

function payloadOf(rec: UnifiedRecord): Record<string, string | number | null> {
  const body: Record<string, string | number | null> = {};
  for (const f of TARGET_FIELDS) {
    body[f.key] = rec.fields[f.key]?.value ?? null;
  }
  return body;
}

export function resetTarget(jobId: string) {
  TARGET.delete(jobId);
}

export function getTarget(jobId: string): Stored {
  let s = TARGET.get(jobId);
  if (!s) {
    s = { batchId: `batch_${jobId.slice(-6)}`, employees: new Map(), failedOnce: new Set() };
    TARGET.set(jobId, s);
  }
  return s;
}

export function pushRecord(job: Job, rec: UnifiedRecord, attempt: number): PushCall {
  const store = getTarget(job.id);
  const emp = rec.employeeNumber ?? rec.id;
  const body = payloadOf(rec);

  if (rec.excluded) {
    return {
      id: uid("http"),
      ts: now(),
      method: "POST",
      path: "/api/v1/employee",
      recordId: rec.id,
      status: 409,
      ok: false,
      body,
      error: "Record excluded from cutover",
      attempt,
    };
  }

  const missing = TARGET_FIELDS.filter((f) => f.required && (body[f.key] == null || body[f.key] === ""));
  if (missing.length) {
    rec.pushStatus = "failed";
    rec.pushError = `422 missing ${missing.map((m) => m.key).join(", ")}`;
    return {
      id: uid("http"),
      ts: now(),
      method: "POST",
      path: "/api/v1/employee",
      recordId: rec.id,
      status: 422,
      ok: false,
      body,
      error: rec.pushError,
      attempt,
    };
  }

  // Deterministic flake: employee numbers ending in 8 fail once with 503.
  if (emp.endsWith("8") && !store.failedOnce.has(emp) && attempt === 1) {
    store.failedOnce.add(emp);
    rec.pushStatus = "failed";
    rec.pushError = "503 target timeout (employee master busy)";
    return {
      id: uid("http"),
      ts: now(),
      method: "POST",
      path: "/api/v1/employee",
      recordId: rec.id,
      status: 503,
      ok: false,
      body,
      error: rec.pushError,
      attempt,
    };
  }

  if (store.employees.has(emp) && rec.pushStatus !== "failed") {
    rec.pushStatus = "failed";
    rec.pushError = "409 employee already exists in this batch";
    return {
      id: uid("http"),
      ts: now(),
      method: "POST",
      path: "/api/v1/employee",
      recordId: rec.id,
      status: 409,
      ok: false,
      body,
      error: rec.pushError,
      attempt,
    };
  }

  store.employees.set(emp, body);
  rec.pushStatus = "success";
  rec.pushError = undefined;
  return {
    id: uid("http"),
    ts: now(),
    method: "POST",
    path: "/api/v1/employee",
    recordId: rec.id,
    status: 201,
    ok: true,
    body,
    attempt,
  };
}

export function rollbackBatch(job: Job): PushCall[] {
  const store = getTarget(job.id);
  const calls: PushCall[] = [];
  for (const rec of job.records) {
    if (rec.pushStatus !== "success") continue;
    const emp = rec.employeeNumber ?? rec.id;
    store.employees.delete(emp);
    rec.pushStatus = "rolled_back";
    calls.push({
      id: uid("http"),
      ts: now(),
      method: "DELETE",
      path: `/api/v1/employee/${encodeURIComponent(emp)}`,
      recordId: rec.id,
      status: 204,
      ok: true,
      body: { employeeNumber: emp, batchId: store.batchId },
      attempt: 1,
    });
  }
  store.employees.clear();
  return calls;
}

export function targetCount(jobId: string): number {
  return getTarget(jobId).employees.size;
}
