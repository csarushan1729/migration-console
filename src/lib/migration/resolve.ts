import type { Escalation, EscalationApply, Job, UnifiedRecord } from "./types.ts";
import { uid, now } from "./ids.ts";
import { refreshReadyState } from "./pipeline.ts";
import { TARGET_FIELDS } from "./schema.ts";

function recOf(job: Job, id: string): UnifiedRecord | undefined {
  return job.records.find((r) => r.id === id);
}

function applyOne(job: Job, apply: EscalationApply): string {
  switch (apply.type) {
    case "set_mapping": {
      const m = job.mappings.find((x) => x.id === apply.mappingId);
      if (!m) return "Mapping gone";
      const before = m.targetField ?? "unmapped";
      m.targetField = apply.targetField;
      m.status = "human";
      m.rationale = `Consultant mapped to ${apply.targetField ?? "ignored"}.`;
      job.audit.push({
        id: uid("aud"),
        ts: now(),
        actor: "human",
        action: "mapping.correct",
        subject: m.header,
        before,
        after: apply.targetField ?? "ignored",
        why: "Consultant overrode an ambiguous column map.",
      });
      return `${m.header} → ${apply.targetField ?? "ignored"}`;
    }
    case "set_field": {
      const rec = recOf(job, apply.recordId);
      if (!rec) return "Record gone";
      const f = rec.fields[apply.field] ?? {
        raw: rec.fields[apply.field]?.raw ?? null,
        value: null,
        confidence: 1,
        lineage: [],
      };
      const before = String(f.value ?? "empty");
      f.value = apply.value;
      f.confidence = 1;
      f.transform = "consultant correction";
      rec.fields[apply.field] = f;
      rec.flags = rec.flags.filter((flag) => !flag.startsWith(`${apply.field}:`));
      if (apply.field === "employeeNumber") rec.employeeNumber = apply.value != null ? String(apply.value) : null;
      job.audit.push({
        id: uid("aud"),
        ts: now(),
        actor: "human",
        action: "value.correct",
        subject: `${rec.employeeNumber ?? rec.id}.${apply.field}`,
        before,
        after: String(apply.value ?? "empty"),
        why: "Consultant supplied the canonical value.",
      });
      if (apply.field === "status" && apply.value === "terminated") {
        job.deltaRules.push({
          id: uid("delta"),
          origin: "human",
          title: "Absconding → terminated + separation reason",
          detail: "Apex uses Absconding as an HR status. Models this as terminated plus a leaving reason. Capture as a delta, not a new enum.",
          appliesTo: "status",
        });
      }
      if (apply.field === "gender" && apply.value === "other") {
        job.deltaRules.push({
          id: uid("delta"),
          origin: "human",
          title: "Gender identity beyond male/female",
          detail: "Target enum has no transgender slot. Mapped to other and flagged for a catalogue delta if the client needs reporting.",
          appliesTo: "gender",
        });
      }
      return `${apply.field} set to ${apply.value ?? "empty"}`;
    }
    case "accept_value": {
      const rec = recOf(job, apply.recordId);
      if (!rec) return "Record gone";
      rec.flags = rec.flags.filter((flag) => !flag.startsWith(`${apply.field}:`));
      const f = rec.fields[apply.field];
      if (f) f.confidence = 1;
      job.audit.push({
        id: uid("aud"),
        ts: now(),
        actor: "human",
        action: "value.accept",
        subject: `${rec.employeeNumber ?? rec.id}.${apply.field}`,
        after: String(f?.value ?? ""),
        why: "Consultant accepted the agent's current value.",
      });
      return `Accepted ${apply.field}`;
    }
    case "exclude_record": {
      const rec = recOf(job, apply.recordId);
      if (!rec) return "Record gone";
      rec.excluded = true;
      rec.flags = [];
      job.audit.push({
        id: uid("aud"),
        ts: now(),
        actor: "human",
        action: "record.exclude",
        subject: rec.employeeNumber ?? rec.id,
        why: "Consultant held this person out of the cutover load.",
      });
      return `Excluded ${rec.employeeNumber ?? rec.id}`;
    }
    case "merge_records": {
      const keep = recOf(job, apply.keepId);
      const drop = recOf(job, apply.dropId);
      if (!keep || !drop) return "Record gone";
      keep.sourceRowIds.push(...drop.sourceRowIds);
      for (const field of TARGET_FIELDS) {
        const a = keep.fields[field.key];
        const b = drop.fields[field.key];
        if ((a?.value == null || a.value === "") && b?.value != null && b.value !== "") {
          keep.fields[field.key] = { ...b, transform: "merged from duplicate" };
        }
      }
      drop.excluded = true;
      keep.flags = keep.flags.filter((f) => !f.includes("duplicate"));
      drop.flags = [];
      job.audit.push({
        id: uid("aud"),
        ts: now(),
        actor: "human",
        action: "record.merge",
        subject: `${keep.employeeNumber} ← ${drop.employeeNumber}`,
        why: "Consultant confirmed a fuzzy duplicate and chose a surviving employee number.",
      });
      job.deltaRules.push({
        id: uid("delta"),
        origin: "human",
        title: `Collapse ${drop.employeeNumber} into ${keep.employeeNumber}`,
        detail: "IT directory minted a second id (APX-1010B) for the same person. Playbook: match on mobile + last name.",
        appliesTo: "employeeNumber",
      });
      return `Merged into ${keep.employeeNumber}`;
    }
  }
}

export function resolveEscalation(job: Job, escalationId: string, optionId: string | null, reject = false): Job {
  const esc = job.escalations.find((e) => e.id === escalationId);
  if (!esc || esc.status !== "open") return job;
  if (reject) {
    esc.status = "rejected";
    esc.resolvedBy = "human";
    esc.resolution = "Rejected — left for a later load";
    if (esc.recordId) {
      const rec = recOf(job, esc.recordId);
      if (rec) rec.excluded = true;
    }
    job.events.push({
      id: uid("ev"),
      ts: now(),
      level: "human",
      step: "review",
      message: `Rejected · ${esc.title}`,
    });
    refreshReadyState(job);
    return job;
  }
  const opt = esc.options?.find((o) => o.id === optionId) ?? esc.options?.[0];
  let resolution = "Acknowledged";
  if (opt) resolution = applyOne(job, opt.apply);
  esc.status = "resolved";
  esc.resolvedBy = "human";
  esc.resolution = resolution;
  job.events.push({
    id: uid("ev"),
    ts: now(),
    level: "human",
    step: "review",
    message: `Resolved · ${esc.title}`,
    detail: resolution,
  });
  closeRelated(job, esc);
  refreshReadyState(job);
  return job;
}

function closeRelated(job: Job, esc: Escalation) {
  if (!esc.recordId) return;
  for (const other of job.escalations) {
    if (other.id === esc.id || other.status !== "open") continue;
    if (other.recordId === esc.recordId && other.field === esc.field) {
      other.status = "resolved";
      other.resolution = "Closed with sibling decision";
      other.resolvedBy = "human";
    }
    const rec = recOf(job, esc.recordId);
    if (rec?.excluded && other.recordId === esc.recordId) {
      other.status = "resolved";
      other.resolution = "Record excluded";
      other.resolvedBy = "human";
    }
  }
}
