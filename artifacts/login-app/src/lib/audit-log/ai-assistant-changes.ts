import type { TFunction } from "i18next";
import { readMetadataRecord } from "@/lib/audit-log/mapping";

const BOOLEAN_TOGGLE_FIELDS = new Set([
  "is_enabled",
  "working_hours_enabled",
  "allow_auto_booking",
  "allow_reschedule",
  "allow_cancellation",
  "handoff_to_human",
  "knowledge_enabled",
  "remember_conversation",
]);

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function summarizeAiAssistantFieldChange(
  field: string,
  metadata: Record<string, unknown>,
  t: TFunction<"common">,
): string | null {
  if (field === "created") {
    return t("auditLogs.activity.aiAssistantChanges.created");
  }

  if (field === "soft_deleted") {
    return t("auditLogs.activity.aiAssistantChanges.softDeleted");
  }

  const newValues = readMetadataRecord(metadata, "new");
  const nextValue = newValues?.[field];

  if (BOOLEAN_TOGGLE_FIELDS.has(field)) {
    const enabled = readBoolean(nextValue);
    if (enabled === true) {
      return t(`auditLogs.activity.aiAssistantChanges.${field}.enabled`);
    }
    if (enabled === false) {
      return t(`auditLogs.activity.aiAssistantChanges.${field}.disabled`);
    }
  }

  const key = `auditLogs.activity.aiAssistantChanges.${field}`;
  const translated = t(key);
  return translated === key ? null : translated;
}

export function summarizeAiAssistantChanges(
  metadata: Record<string, unknown>,
  t: TFunction<"common">,
): string[] {
  const rawFields = metadata.changed_fields;
  if (!Array.isArray(rawFields)) {
    return [];
  }

  return rawFields
    .filter((field): field is string => typeof field === "string")
    .map((field) => summarizeAiAssistantFieldChange(field, metadata, t))
    .filter((entry): entry is string => Boolean(entry));
}
