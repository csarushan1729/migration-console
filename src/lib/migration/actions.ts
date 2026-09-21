import { createServerFn } from "@tanstack/react-start";
import type { UploadedFile } from "./types.ts";

export const startSampleJob = createServerFn({ method: "POST" }).handler(async () => {
  const { startSampleJobImpl } = await import("./run.server");
  return startSampleJobImpl();
});

export const startUploadJob = createServerFn({ method: "POST" })
  .validator((input: { clientName: string; files: UploadedFile[] }) => input)
  .handler(async ({ data }) => {
    const { startUploadJobImpl } = await import("./run.server");
    return startUploadJobImpl(data.clientName, data.files);
  });

export const tickJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const { tickJobImpl } = await import("./run.server");
    return tickJobImpl(data.jobId);
  });

export const fetchJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const { fetchJobImpl } = await import("./run.server");
    return fetchJobImpl(data.jobId);
  });

export const listRecentJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { listJobsImpl } = await import("./run.server");
  return listJobsImpl();
});

export const resolveJobEscalation = createServerFn({ method: "POST" })
  .validator((input: { jobId: string; escalationId: string; optionId?: string; reject?: boolean }) => input)
  .handler(async ({ data }) => {
    const { resolveJobEscalationImpl } = await import("./run.server");
    return resolveJobEscalationImpl(data.jobId, data.escalationId, data.optionId, data.reject);
  });

export const pushJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string; retryFailed?: boolean }) => input)
  .handler(async ({ data }) => {
    const { pushJobImpl } = await import("./run.server");
    return pushJobImpl(data.jobId, data.retryFailed);
  });

export const rollbackJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const { rollbackJobImpl } = await import("./run.server");
    return rollbackJobImpl(data.jobId);
  });
