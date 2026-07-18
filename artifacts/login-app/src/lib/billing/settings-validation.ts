import type { BillingSettingRow } from "@/lib/billing/types";

type ValidationTranslate = (key: string, options?: Record<string, unknown>) => string;

export function validateBillingSettingDraft(
  row: BillingSettingRow,
  raw: string,
  t?: ValidationTranslate,
): string | null {
  const msg = (key: string, options?: Record<string, unknown>) =>
    t ? t(key, options) : key;
  const trimmed = raw.trim();

  switch (row.value_type) {
    case "boolean":
      if (raw !== "true" && raw !== "false") {
        return msg("billing.settings.validation.boolean");
      }
      return null;
    case "integer": {
      if (!/^-?\d+$/.test(trimmed)) {
        return msg("billing.settings.validation.integer");
      }
      const num = Number.parseInt(trimmed, 10);
      const min = row.validation_schema?.min != null ? Number(row.validation_schema.min) : null;
      const max = row.validation_schema?.max != null ? Number(row.validation_schema.max) : null;
      if (min != null && num < min) return msg("billing.settings.validation.min", { min });
      if (max != null && num > max) return msg("billing.settings.validation.max", { max });
      return null;
    }
    case "decimal": {
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return msg("billing.settings.validation.decimal");
      }
      const num = Number.parseFloat(trimmed);
      const min = row.validation_schema?.min != null ? Number(row.validation_schema.min) : null;
      const max = row.validation_schema?.max != null ? Number(row.validation_schema.max) : null;
      if (min != null && num < min) return msg("billing.settings.validation.min", { min });
      if (max != null && num > max) return msg("billing.settings.validation.max", { max });
      return null;
    }
    case "json":
      try {
        JSON.parse(raw);
        return null;
      } catch {
        return msg("billing.settings.validation.invalidJson");
      }
    case "string":
    case "template_ref":
      if (trimmed.length === 0 && !row.validation_schema?.allow_empty) {
        return msg("billing.settings.validation.required");
      }
      return null;
    default:
      return null;
  }
}
