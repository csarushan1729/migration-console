export const TARGET_SYSTEM = "Darwinbox Employee Master";

export type FieldType = "string" | "email" | "phone" | "date" | "enum" | "number";

export type TargetField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique?: boolean;
  description: string;
  enumValues?: string[];
  pattern?: string;
};

export type SourceFile = {
  id: string;
  name: string;
  kind: "csv" | "xlsx";
  sheet?: string;
  rows: Record<string, string>[];
  headers: string[];
  rowCount: number;
};

export type ColumnProfile = {
  id: string;
  fileId: string;
  fileName: string;
  header: string;
  normalized: string;
  samples: string[];
  nullRate: number;
  uniqueCount: number;
  inferred: "string" | "number" | "date" | "email" | "phone" | "enum" | "id";
};

export type FieldMapping = {
  id: string;
  sourceColumnId: string;
  fileName: string;
  header: string;
  targetField: string | null;
  confidence: number;
  margin: number;
  rationale: string;
  status: "auto" | "escalated" | "human" | "ignored";
  candidates: { field: string; score: number }[];
};

export type Lineage = {
  fileName: string;
  column: string;
  row: number;
};

export type FieldValue = {
  raw: string | null;
  value: string | number | null;
  confidence: number;
  lineage: Lineage[];
  transform?: string;
  conflictValues?: (string | number)[];
};

export type UnifiedRecord = {
  id: string;
  employeeNumber: string | null;
  fields: Record<string, FieldValue>;
  sourceRowIds: string[];
  flags: string[];
  excluded: boolean;
  pushStatus?: "pending" | "success" | "failed" | "rolled_back";
  pushError?: string;
};

export type EscalationKind =
  | "mapping_ambiguous"
  | "mapping_competing"
  | "mapping_missing_required"
  | "value_ambiguous_date"
  | "value_unknown_enum"
  | "conflict_cross_file"
  | "duplicate_fuzzy"
  | "validation_failed";

export type Escalation = {
  id: string;
  kind: EscalationKind;
  title: string;
  why: string;
  evidence: string[];
  recommendation: string;
  recordId?: string;
  mappingId?: string;
  field?: string;
  options?: { id: string; label: string; apply: EscalationApply }[];
  status: "open" | "resolved" | "rejected";
  resolution?: string;
  resolvedBy?: "human";
  confidence: number;
};

export type EscalationApply =
  | { type: "set_mapping"; mappingId: string; targetField: string | null }
  | { type: "set_field"; recordId: string; field: string; value: string | number | null }
  | { type: "merge_records"; keepId: string; dropId: string }
  | { type: "exclude_record"; recordId: string }
  | { type: "accept_value"; recordId: string; field: string };

export type AgentEvent = {
  id: string;
  ts: number;
  level: "info" | "auto" | "escalate" | "human" | "push" | "warn";
  step: string;
  message: string;
  detail?: string;
};

export type AuditEntry = {
  id: string;
  ts: number;
  actor: "agent" | "human" | "target";
  action: string;
  subject: string;
  before?: string;
  after?: string;
  why: string;
};

export type DeltaRule = {
  id: string;
  origin: "inferred" | "human";
  title: string;
  detail: string;
  appliesTo: string;
};

export type PushCall = {
  id: string;
  ts: number;
  method: string;
  path: string;
  recordId: string;
  status: number;
  ok: boolean;
  body: Record<string, string | number | null>;
  error?: string;
  attempt: number;
};

export type PipelineStepId =
  | "ingest"
  | "profile"
  | "map"
  | "ai_assist"
  | "transform"
  | "reconcile"
  | "validate"
  | "summarize";

export type JobStatus =
  | "running"
  | "awaiting_human"
  | "ready_to_push"
  | "pushing"
  | "partial_failure"
  | "complete"
  | "rolled_back";

export type Job = {
  id: string;
  clientName: string;
  engagement: string;
  targetSystem: string;
  createdAt: number;
  status: JobStatus;
  pipeline: PipelineStepId[];
  pipelineIndex: number;
  files: SourceFile[];
  columns: ColumnProfile[];
  mappings: FieldMapping[];
  records: UnifiedRecord[];
  escalations: Escalation[];
  events: AgentEvent[];
  audit: AuditEntry[];
  deltaRules: DeltaRule[];
  pushCalls: PushCall[];
  batchId?: string;
  metrics: {
    sourceRows: number;
    uniquePeople: number;
    autoMapped: number;
    escalations: number;
    autoTransforms: number;
    pushed: number;
    failed: number;
  };
};

export type JobSnapshot = Omit<Job, "files"> & {
  files: { id: string; name: string; kind: SourceFile["kind"]; headers: string[]; rowCount: number }[];
};

export type UploadedFile = {
  name: string;
  text?: string;
  base64?: string;
};
