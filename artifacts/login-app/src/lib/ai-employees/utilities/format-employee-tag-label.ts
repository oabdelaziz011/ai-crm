import type { TFunction } from "i18next";

/** Human-readable label for employee routing / capability tags. */
export function formatEmployeeTagLabel(t: TFunction<"common">, tag: string): string {
  if (tag.startsWith("channel:")) {
    const key = tag.slice("channel:".length);
    if (key === "whatsapp" || key === "messenger" || key === "instagram") {
      return t(`aiEmployees.form.channelRouting.channels.${key}`);
    }
    // UUID company-channel id — keep short technical suffix
    if (/^[0-9a-f-]{36}$/i.test(key)) {
      return t("aiEmployees.tags.companyChannel", { id: key.slice(0, 8) });
    }
    return t("aiEmployees.tags.channel", { key });
  }

  if (tag.startsWith("capability:")) {
    const key = tag.slice("capability:".length);
    return t(`aiEmployees.tags.capabilities.${key}`, {
      defaultValue: t("aiEmployees.tags.capability", { key }),
    });
  }

  if (tag.startsWith("language:")) {
    const code = tag.slice("language:".length);
    return t(`aiEmployees.tags.languages.${code}`, {
      defaultValue: t("aiEmployees.tags.language", { code }),
    });
  }

  return tag;
}

const ENGLISH_EMPTY_SUMMARIES = new Set([
  "No skills assigned",
  "No knowledge sources",
  "No knowledge sources assigned",
  "No tools assigned",
]);

/** Localize known English empty/summary placeholders from persisted rows. */
export function localizeEmployeeSummary(
  t: TFunction<"common">,
  value: string | null | undefined,
  emptyKey: string,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || ENGLISH_EMPTY_SUMMARIES.has(trimmed)) {
    return t(emptyKey);
  }
  return trimmed;
}
