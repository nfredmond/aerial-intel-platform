import type { OrgEventRow } from "@/lib/supabase/admin";

type PayloadRecord = Record<string, unknown>;

const COPILOT_AUDIT_COLUMNS = [
  "created_at",
  "event_type",
  "actor_user_id",
  "skill",
  "status",
  "target_type",
  "target_id",
  "reason",
  "model_id",
  "spend_tenth_cents",
  "total_sentences",
  "kept_sentences",
  "dropped_sentences",
  "cited_fact_count",
  "input_tokens",
  "output_tokens",
  "cap_tenth_cents",
  "remaining_tenth_cents",
] as const;

function getPayloadRecord(row: OrgEventRow): PayloadRecord {
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as PayloadRecord;
}

function payloadValue(payload: PayloadRecord, key: string) {
  const value = payload[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return "";
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCopilotAuditCsv(rows: OrgEventRow[]): string {
  const lines = [
    COPILOT_AUDIT_COLUMNS.join(","),
    ...rows.map((row) => {
      const payload = getPayloadRecord(row);
      return [
        row.created_at,
        row.event_type,
        row.actor_user_id ?? "",
        payloadValue(payload, "skill"),
        payloadValue(payload, "status"),
        payloadValue(payload, "targetType"),
        payloadValue(payload, "targetId"),
        payloadValue(payload, "reason"),
        payloadValue(payload, "modelId"),
        payloadValue(payload, "spendTenthCents"),
        payloadValue(payload, "totalSentences"),
        payloadValue(payload, "keptSentences"),
        payloadValue(payload, "droppedSentences"),
        payloadValue(payload, "citedFactCount"),
        payloadValue(payload, "inputTokens"),
        payloadValue(payload, "outputTokens"),
        payloadValue(payload, "capTenthCents"),
        payloadValue(payload, "remainingTenthCents"),
      ]
        .map(csvCell)
        .join(",");
    }),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function copilotAuditFilename(input: { orgSlug?: string | null; now?: Date }) {
  const slug =
    input.orgSlug
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org";
  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  return `aerial-copilot-audit-${slug}-${date}.csv`;
}
