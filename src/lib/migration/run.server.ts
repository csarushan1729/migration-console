import type { Job, JobSnapshot, UploadedFile } from "./types.ts";
import { TARGET_SYSTEM } from "./types.ts";
import { uid, now } from "./ids.ts";
import { parseUploaded, csvAsXlsxBase64 } from "./parse.ts";
import { SAMPLE_CLIENT, SAMPLE_ENGAGEMENT, SAMPLE_FILES } from "./samples.ts";
import { PIPELINE, runStep } from "./pipeline.ts";
import { getJob, listJobs, saveJob, snapshot } from "./store.ts";
import { resolveEscalation } from "./resolve.ts";
import { pushRecord, rollbackBatch, getTarget } from "./target-api.ts";

function createJob(clientName: string, engagement: string, files: UploadedFile[]): Job {
  const parsed = files.map(parseUploaded).filter((f) => f.rowCount > 0);
  if (parsed.length === 0) throw new Error("No usable rows in the uploaded files.");
  const job: Job = {
    id: uid("mrd"),
    clientName,
    engagement,
    targetSystem: TARGET_SYSTEM,
    createdAt: now(),
    status: "running",
    pipeline: [...PIPELINE],
    pipelineIndex: 0,
    files: parsed,
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
  };
  saveJob(job);
  return job;
}

export function startSampleJobImpl(): JobSnapshot {
  const xlsx = SAMPLE_FILES[2];
  const files: UploadedFile[] = [
    { name: SAMPLE_FILES[0].name, text: SAMPLE_FILES[0].text },
    { name: SAMPLE_FILES[1].name, text: SAMPLE_FILES[1].text },
    { name: xlsx.name, base64: csvAsXlsxBase64(xlsx.text) },
  ];
  return snapshot(createJob(SAMPLE_CLIENT, SAMPLE_ENGAGEMENT, files));
}

export function startUploadJobImpl(clientName: string, files: UploadedFile[]): JobSnapshot {
  return snapshot(createJob(clientName || "Unnamed client", "Ad-hoc employee load", files));
}

export async function tickJobImpl(jobId: string): Promise<JobSnapshot> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  if (job.status === "running") await runStep(job);
  saveJob(job);
  return snapshot(job);
}

export function fetchJobImpl(jobId: string): JobSnapshot | null {
  const job = getJob(jobId);
  return job ? snapshot(job) : null;
}

export function listJobsImpl() {
  return listJobs();
}

export function resolveJobEscalationImpl(
  jobId: string,
  escalationId: string,
  optionId?: string,
  reject?: boolean,
): JobSnapshot {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  resolveEscalation(job, escalationId, optionId ?? null, reject);
  saveJob(job);
  return snapshot(job);
}

export function pushJobImpl(jobId: string, retryFailed?: boolean): JobSnapshot {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  const open = job.escalations.some((e) => e.status === "open");
  if (open) throw new Error("Resolve open escalations before pushing.");
  job.status = "pushing";
  job.batchId = getTarget(job.id).batchId;
  const targets = job.records.filter((r) => !r.excluded);
  const pending = retryFailed
    ? targets.filter((r) => r.pushStatus === "failed")
    : targets.filter((r) => r.pushStatus !== "success");
  for (const rec of pending) {
    const attempt = (job.pushCalls.filter((c) => c.recordId === rec.id).length || 0) + 1;
    const call = pushRecord(job, rec, attempt);
    job.pushCalls.push(call);
    job.audit.push({
      id: `aud_${call.id}`,
      ts: call.ts,
      actor: "target",
      action: call.ok ? "push.ok" : "push.fail",
      subject: rec.employeeNumber ?? rec.id,
      why: call.ok ? `POST /api/v1/employee → ${call.status}` : (call.error ?? "failed"),
      after: call.ok ? "created" : String(call.status),
    });
    job.events.push({
      id: `ev_${call.id}`,
      ts: call.ts,
      level: call.ok ? "push" : "warn",
      step: "push",
      message: call.ok
        ? `201 created · ${rec.employeeNumber}`
        : `${call.status} · ${rec.employeeNumber} · ${call.error}`,
    });
  }
  const success = job.records.filter((r) => r.pushStatus === "success").length;
  const failed = job.records.filter((r) => r.pushStatus === "failed").length;
  job.metrics.pushed = success;
  job.metrics.failed = failed;
  job.status = failed ? "partial_failure" : "complete";
  saveJob(job);
  return snapshot(job);
}

export function rollbackJobImpl(jobId: string): JobSnapshot {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  const calls = rollbackBatch(job);
  job.pushCalls.push(...calls);
  job.status = "rolled_back";
  job.metrics.pushed = 0;
  job.events.push({
    id: `ev_rb_${Date.now()}`,
    ts: Date.now(),
    level: "warn",
    step: "rollback",
    message: `Rolled back batch ${job.batchId} · ${calls.length} deletes`,
  });
  job.audit.push({
    id: `aud_rb_${Date.now()}`,
    ts: Date.now(),
    actor: "human",
    action: "batch.rollback",
    subject: job.batchId ?? job.id,
    why: "Consultant requested a full rollback of the push batch.",
  });
  saveJob(job);
  return snapshot(job);
}
