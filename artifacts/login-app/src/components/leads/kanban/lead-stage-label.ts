import type { TFunction } from "i18next";

/** Normalize stage slug / English name for i18n lookup. Never display raw English keys. */
export function normalizeLeadStageKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "");
}

const ENGLISH_NAME_TO_KEY: Record<string, string> = {
  new: "new",
  qualified: "qualified",
  contacted: "contacted",
  demo_scheduled: "demo_scheduled",
  demoscheduled: "demo_scheduled",
  "demo scheduled": "demo_scheduled",
  proposal: "proposal_sent",
  proposal_sent: "proposal_sent",
  "proposal sent": "proposal_sent",
  negotiation: "negotiation",
  won: "won",
  closed: "closed",
  lost: "lost",
  converted: "converted",
  nurturing: "nurturing",
  archived: "archived",
};

/**
 * Resolve localized stage label from slug / lifecycle / name.
 * Internal keys stay English; UI always uses translation.
 */
export function translateLeadStageLabel(
  t: TFunction,
  stage: { name: string; slug?: string | null; lifecycleStatus?: string | null },
): string {
  const candidates = [
    stage.slug ? normalizeLeadStageKey(stage.slug) : "",
    stage.lifecycleStatus ? normalizeLeadStageKey(stage.lifecycleStatus) : "",
    ENGLISH_NAME_TO_KEY[stage.name.trim().toLowerCase()] ?? normalizeLeadStageKey(stage.name),
  ].filter(Boolean);

  for (const key of candidates) {
    const stageKey = `leads.stages.${key}`;
    const stageTranslated = t(stageKey);
    if (stageTranslated !== stageKey) return stageTranslated;

    const lifecycleKey = `leads.lifecycle.${key}`;
    const lifecycleTranslated = t(lifecycleKey);
    if (lifecycleTranslated !== lifecycleKey) return lifecycleTranslated;
  }

  // Last resort: never surface raw lifecycle tokens like "new"
  if (stage.name && !/^[a-z_]+$/.test(stage.name.trim())) return stage.name;
  return t("leads.stages.unknown", { defaultValue: stage.name || "—" });
}

export function translateLeadLifecycleStatusSafe(t: TFunction, status: string): string {
  const key = normalizeLeadStageKey(status);
  const mapped = ENGLISH_NAME_TO_KEY[key] ?? key;
  const i18nKey = `leads.lifecycle.${mapped}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return translateLeadStageLabel(t, { name: status, lifecycleStatus: status, slug: status });
}
