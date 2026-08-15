import type { TFunction } from "i18next";

/** Translate ops status codes; falls back to the raw value when unknown. */
export function opsStatusLabel(t: TFunction<"common">, status: string | null | undefined): string {
  if (!status) return t("platformAiOps.status.unknown");
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return t(`platformAiOps.status.${normalized}`, { defaultValue: status.replace(/_/g, " ") });
}
