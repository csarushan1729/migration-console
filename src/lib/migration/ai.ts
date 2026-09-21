import type { ColumnProfile, FieldMapping } from "./types.ts";
import { TARGET_FIELDS } from "./schema.ts";

type AiMapping = {
  sourceColumnId: string;
  targetField: string | null;
  confidence: number;
  rationale: string;
};

export async function assistUnmappedColumns(
  columns: ColumnProfile[],
  mappings: FieldMapping[],
): Promise<{ used: boolean; updates: AiMapping[]; note: string }> {
  const uncertain = mappings.filter((m) => m.status === "escalated" || (m.status === "ignored" && m.confidence >= 0.3));
  if (uncertain.length === 0) {
    return { used: false, updates: [], note: "Nothing left for the model — heuristics covered the board." };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { used: false, updates: [], note: "Model assist unavailable in this environment. Heuristics stand." };
  }

  const colById = new Map(columns.map((c) => [c.id, c]));
  const payload = uncertain.slice(0, 12).map((m) => {
    const col = colById.get(m.sourceColumnId);
    return {
      sourceColumnId: m.sourceColumnId,
      file: m.fileName,
      header: m.header,
      samples: col?.samples ?? [],
      inferred: col?.inferred,
      heuristicCandidates: m.candidates,
    };
  });

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior HRIS implementation engineer mapping messy client exports onto a Darwinbox-like employee master. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction:
                "For each source column, pick at most one target field or null. Do not guess dates onto DOB/DOJ when the header is generic (Pay Date, Updated). Do not map cost center to department if a real department column exists. confidence 0-1.",
              targetFields: TARGET_FIELDS.map((f) => ({
                key: f.key,
                type: f.type,
                required: f.required,
              })),
              columns: payload,
            }),
          },
        ],
      }),
    });
    if (!res.ok) {
      return { used: false, updates: [], note: `Model assist returned ${res.status} — continuing on heuristics.` };
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { mappings?: AiMapping[] };
    const updates = (parsed.mappings ?? []).filter((u) => u.sourceColumnId);
    return { used: true, updates, note: `Model reviewed ${payload.length} uncertain columns.` };
  } catch {
    return { used: false, updates: [], note: "Model assist failed — heuristics stand." };
  }
}

export function applyAiUpdates(mappings: FieldMapping[], updates: AiMapping[]): number {
  let applied = 0;
  const byId = new Map(mappings.map((m) => [m.sourceColumnId, m]));
  for (const u of updates) {
    const m = byId.get(u.sourceColumnId);
    if (!m) continue;
    if (m.status === "auto") continue;
    if (u.targetField && u.confidence >= 0.82) {
      m.targetField = u.targetField;
      m.confidence = u.confidence;
      m.status = "auto";
      m.rationale = `Model: ${u.rationale}`;
      applied += 1;
    } else if (u.targetField && u.confidence >= 0.45) {
      m.rationale = `Model leans ${u.targetField} (${Math.round(u.confidence * 100)}%): ${u.rationale}`;
    }
  }
  return applied;
}
