import type { DeltaRule, Escalation, Job, PipelineStepId } from "./types.ts";
import { uid, now } from "./ids.ts";
import { profileColumns, proposeMappings } from "./mapping.ts";
import { applyAiUpdates, assistUnmappedColumns } from "./ai.ts";
import {
  buildRecords,
  conflictEscalations,
  findFuzzyDuplicates,
  validationEscalations,
  valueIssueEscalations,
} from "./reconcile.ts";
import { REQUIRED_KEYS } from "./schema.ts";
import { KIND_LABEL } from "./policy.ts";

export const PIPELINE: PipelineStepId[] = [
  "ingest",
  "profile",
  "map",
  "ai_assist",
  "transform",
  "reconcile",
  "validate",
  "summarize",
];

function ev(job: Job, level: Job["events"][number]["level"], step: string, message: string, detail?: string) {
  job.events.push({ id: uid("ev"), ts: now(), level, step, message, detail });
  if (job.events.length > 80) job.events.splice(0, job.events.length - 80);
}

function audit(job: Job, action: string, subject: string, why: string, before?: string, after?: string) {
  job.audit.push({
    id: uid("aud"),
    ts: now(),
    actor: "agent",
    action,
    subject,
    why,
    before,
    after,
  });
}

function mappingEscalations(job: Job): Escalation[] {
  const out: Escalation[] = [];
  for (const m of job.mappings) {
    if (m.status !== "escalated") continue;
    const competing = m.rationale.toLowerCase().includes("compete");
    out.push({
      id: uid("esc"),
      kind: competing ? "mapping_competing" : "mapping_ambiguous",
      title: competing
        ? `“${m.header}” competes for ${m.candidates[0]?.field}`
        : `Where does “${m.header}” belong?`,
      why: m.rationale,
      evidence: [
        `${m.fileName} · ${m.header}`,
        ...m.candidates.slice(0, 3).map((c) => `${c.field} · ${Math.round(c.score * 100)}%`),
      ],
      recommendation: m.candidates[0]
        ? `Map to ${m.candidates[0].field} or ignore as leftover.`
        : "Ignore this column.",
      mappingId: m.id,
      confidence: m.confidence,
      status: "open",
      options: [
        ...m.candidates.slice(0, 3).map((c) => ({
          id: c.field,
          label: `Map to ${c.field} (${Math.round(c.score * 100)}%)`,
          apply: { type: "set_mapping" as const, mappingId: m.id, targetField: c.field },
        })),
        {
          id: "ignore",
          label: "Ignore column",
          apply: { type: "set_mapping" as const, mappingId: m.id, targetField: null },
        },
      ],
    });
  }

  const mappedTargets = new Set(job.mappings.filter((m) => m.targetField && m.status !== "ignored").map((m) => m.targetField));
  const hasFullName = job.mappings.some((m) => m.targetField === "fullName" && m.status === "auto");
  if (hasFullName) {
    mappedTargets.add("firstName");
    mappedTargets.add("lastName");
  }
  for (const key of REQUIRED_KEYS) {
    if (mappedTargets.has(key)) continue;
    out.push({
      id: uid("esc"),
      kind: "mapping_missing_required",
      title: `Required field ${key} has no source`,
      why: "The target schema requires this field and no source column cleared the auto-map bar.",
      evidence: [`Target: ${key}`],
      recommendation: "Pick a source column or fill downstream from a delta rule.",
      confidence: 0.2,
      status: "open",
      options: job.columns.slice(0, 8).map((c) => ({
        id: c.id,
        label: `${c.fileName} · ${c.header}`,
        apply: {
          type: "set_mapping" as const,
          mappingId: job.mappings.find((m) => m.sourceColumnId === c.id)?.id ?? "",
          targetField: key,
        },
      })),
    });
  }
  return out;
}

function inferDeltaRules(job: Job): DeltaRule[] {
  const rules: DeltaRule[] = [];
  const ids = job.files.flatMap((f) => f.rows.map((r) => Object.values(r).find((v) => /^APX-/i.test(v)) ?? ""));
  if (ids.filter((v) => /^APX-/i.test(v)).length >= 3) {
    rules.push({
      id: uid("delta"),
      origin: "inferred",
      title: "Strip APX- employee prefix",
      detail: "Apex keys people as APX-1001 in HRIS/IT and 1001 in payroll. Canonical form is the numeric id.",
      appliesTo: "employeeNumber, managerEmployeeNumber",
    });
  }
  rules.push({
    id: uid("delta"),
    origin: "inferred",
    title: "Permanent → full_time",
    detail: "Client vocabulary for worker type is Permanent/Contract/Intern, not Darwinbox’s enum.",
    appliesTo: "employmentType",
  });
  rules.push({
    id: uid("delta"),
    origin: "inferred",
    title: "Default currency INR",
    detail: "When CTC is present and currency is silent, assume INR — Apex is an Indian legal entity.",
    appliesTo: "currency",
  });
  return rules;
}

export async function runStep(job: Job): Promise<Job> {
  if (job.status !== "running") return job;
  const step = job.pipeline[job.pipelineIndex];
  if (!step) {
    job.status = job.escalations.some((e) => e.status === "open") ? "awaiting_human" : "ready_to_push";
    return job;
  }

  switch (step) {
    case "ingest": {
      const rows = job.files.reduce((n, f) => n + f.rowCount, 0);
      job.metrics.sourceRows = rows;
      ev(
        job,
        "info",
        "ingest",
        `Ingested ${job.files.length} files · ${rows} source rows`,
        job.files.map((f) => `${f.name} (${f.kind}, ${f.rowCount})`).join(" · "),
      );
      audit(job, "ingest", job.id, "Parsed source extracts without a predefined column map.");
      break;
    }
    case "profile": {
      job.columns = profileColumns(job.files);
      ev(job, "info", "profile", `Profiled ${job.columns.length} source columns`, "Inferred type, null rate, uniqueness, samples.");
      audit(job, "profile", `${job.columns.length} columns`, "Statistical profile used for mapping scores.");
      break;
    }
    case "map": {
      const { mappings } = proposeMappings(job.columns);
      job.mappings = mappings;
      const auto = mappings.filter((m) => m.status === "auto").length;
      const esc = mappings.filter((m) => m.status === "escalated").length;
      job.metrics.autoMapped = auto;
      ev(job, "auto", "map", `Auto-mapped ${auto} columns · ${esc} need a human`, "Threshold: ≥82% confidence and 18-point lead.");
      for (const m of mappings.filter((x) => x.status === "auto")) {
        audit(job, "map.auto", `${m.header} → ${m.targetField}`, m.rationale);
      }
      for (const m of mappings.filter((x) => x.status === "escalated")) {
        ev(job, "escalate", "map", `Escalated “${m.header}”`, m.rationale);
      }
      break;
    }
    case "ai_assist": {
      const result = await assistUnmappedColumns(job.columns, job.mappings);
      const applied = applyAiUpdates(job.mappings, result.updates);
      job.metrics.autoMapped = job.mappings.filter((m) => m.status === "auto").length;
      ev(job, result.used ? "auto" : "info", "ai_assist", result.note, applied ? `${applied} additional auto-maps` : undefined);
      if (applied) audit(job, "map.model", `${applied} columns`, "Model assist above 82% was auto-applied; weaker suggestions stay in queue.");
      break;
    }
    case "transform": {
      const built = buildRecords(job.files, job.columns, job.mappings);
      job.records = built.records;
      job.metrics.autoTransforms = built.transforms;
      job.metrics.uniquePeople = built.records.length;
      ev(
        job,
        "auto",
        "transform",
        `Applied ${built.transforms} safe transforms · ${built.records.length} people`,
        "Dates, casing, IDs, phones, enums with known synonyms.",
      );
      audit(job, "transform", `${built.transforms} writes`, "Only mechanical, reversible cleanups.");
      job.deltaRules = inferDeltaRules(job);
      break;
    }
    case "reconcile": {
      const exactBefore = job.metrics.sourceRows;
      const fuzzy = findFuzzyDuplicates(job.records);
      const conflicts = conflictEscalations(job.records);
      job.escalations.push(...fuzzy, ...conflicts);
      ev(
        job,
        "auto",
        "reconcile",
        `Merged 3 systems → ${job.records.length} unique people`,
        `Exact duplicates collapsed (${exactBefore} rows in). ${fuzzy.length} fuzzy pairs, ${conflicts.length} value conflicts.`,
      );
      if (fuzzy.length) ev(job, "escalate", "reconcile", `${fuzzy.length} possible duplicate${fuzzy.length > 1 ? "s" : ""}`, fuzzy[0]?.title);
      if (conflicts.length) ev(job, "escalate", "reconcile", `${conflicts.length} cross-file conflict${conflicts.length > 1 ? "s" : ""}`, conflicts[0]?.title);
      audit(job, "reconcile", `${job.records.length} people`, "Exact id/email matches merged; fuzzy matches escalated.");
      break;
    }
    case "validate": {
      const fuzzyIds = new Set(
        job.escalations
          .filter((e) => e.kind === "duplicate_fuzzy" && e.status === "open")
          .flatMap((e) => {
            const ids: string[] = [];
            if (e.recordId) ids.push(e.recordId);
            for (const opt of e.options ?? []) {
              if (opt.apply.type === "merge_records") {
                ids.push(opt.apply.keepId, opt.apply.dropId);
              }
            }
            return ids;
          }),
      );
      const valueEsc = valueIssueEscalations(job.records);
      const valEsc = validationEscalations(job.records, fuzzyIds);
      const mapEsc = mappingEscalations(job);
      job.escalations.push(...valueEsc, ...valEsc, ...mapEsc);
      const seen = new Set<string>();
      job.escalations = job.escalations.filter((e) => {
        const k = `${e.kind}:${e.recordId ?? ""}:${e.mappingId ?? ""}:${e.field ?? e.title}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const open = job.escalations.filter((e) => e.status === "open").length;
      job.metrics.escalations = open;
      const clean = job.records.filter((r) => !r.flags.length && !r.excluded).length;
      ev(job, open ? "escalate" : "auto", "validate", `Validation · ${clean} clean records · ${open} escalations`, open ? "Paused for a human — none of these are safe to guess." : "No open escalations.");
      audit(job, "validate", `${open} escalations`, "Boundary: ambiguous, conflicting, or unmappable. Not style nits.");
      break;
    }
    case "summarize": {
      const open = job.escalations.filter((e) => e.status === "open");
      const byKind: Record<string, number> = {};
      for (const e of open) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      const breakdown = Object.entries(byKind)
        .map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`)
        .join(" · ");
      job.status = open.length ? "awaiting_human" : "ready_to_push";
      ev(
        job,
        open.length ? "escalate" : "auto",
        "summarize",
        open.length ? `Paused · ${open.length} items need a consultant` : "Ready to push · no open escalations",
        breakdown || "All mechanical.",
      );
      break;
    }
  }

  job.pipelineIndex += 1;
  if (job.status === "running" && job.pipelineIndex >= job.pipeline.length) {
    job.status = job.escalations.some((e) => e.status === "open") ? "awaiting_human" : "ready_to_push";
  }
  return job;
}

export function refreshReadyState(job: Job) {
  const open = job.escalations.filter((e) => e.status === "open").length;
  job.metrics.escalations = open;
  if (job.status === "awaiting_human" && open === 0) job.status = "ready_to_push";
  if (job.status === "ready_to_push" && open > 0) job.status = "awaiting_human";
}
