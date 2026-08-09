/**
 * Localize known default opportunity pipeline / stage catalog names.
 * Custom company-defined names pass through unchanged.
 */

type TranslateFn = (key: string) => string;

const STAGE_I18N_KEYS: Record<string, string> = {
  qualification: "opportunities.stages.qualification",
  discovery: "opportunities.stages.discovery",
  proposal: "opportunities.stages.proposal",
  negotiation: "opportunities.stages.negotiation",
  contract: "opportunities.stages.contract",
  won: "opportunities.stages.won",
  lost: "opportunities.stages.lost",
};

const PIPELINE_I18N_KEYS: Record<string, string> = {
  "sales execution": "opportunities.pipelines.salesExecution",
  "sales-execution": "opportunities.pipelines.salesExecution",
};

const CHANNEL_I18N_KEYS: Record<string, string> = {
  call: "leads360.channels.call",
  phone: "leads360.channels.call",
  email: "leads360.channels.email",
  whatsapp: "leads360.channels.whatsapp",
  sms: "leads360.channels.sms",
  meeting: "leads360.channels.meeting",
  note: "leads360.channels.note",
  system: "leads360.channels.system",
  other: "leads360.channels.other",
};

const TASK_STATUS_I18N_KEYS: Record<string, string> = {
  open: "leads360.taskStatus.open",
  pending: "leads360.taskStatus.pending",
  "in progress": "leads360.taskStatus.inProgress",
  in_progress: "leads360.taskStatus.inProgress",
  done: "leads360.taskStatus.done",
  completed: "leads360.taskStatus.completed",
  cancelled: "leads360.taskStatus.cancelled",
  canceled: "leads360.taskStatus.cancelled",
};

const INTENT_I18N_KEYS: Record<string, string> = {
  "pricing inquiry": "leads360.intents.pricingInquiry",
  "demo request": "leads360.intents.demoRequest",
  integration: "leads360.intents.integration",
  support: "leads360.intents.support",
};

function catalogKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function translateMapped(
  t: TranslateFn,
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const i18nKey = map[catalogKey(raw)];
  if (!i18nKey) return raw;
  const translated = t(i18nKey);
  return translated === i18nKey ? raw : translated;
}

export function localizeOpportunityStageName(
  t: TranslateFn,
  name: string | null | undefined,
): string {
  return translateMapped(t, STAGE_I18N_KEYS, name);
}

export function localizeOpportunityPipelineName(
  t: TranslateFn,
  name: string | null | undefined,
): string {
  return translateMapped(t, PIPELINE_I18N_KEYS, name);
}

export function localizeLeadChannel(t: TranslateFn, channel: string | null | undefined): string {
  return translateMapped(t, CHANNEL_I18N_KEYS, channel);
}

export function localizeLeadTaskStatus(t: TranslateFn, status: string | null | undefined): string {
  return translateMapped(t, TASK_STATUS_I18N_KEYS, status);
}

export function localizeLeadIntent(t: TranslateFn, intent: string | null | undefined): string {
  return translateMapped(t, INTENT_I18N_KEYS, intent);
}
