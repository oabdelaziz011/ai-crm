/**
 * Email Settings internal tabs — exactly Connection + Email Identity.
 * Legacy tab/hash values map onto these two.
 */

export const EMAIL_SETTINGS_TAB_IDS = ["connection", "identity"] as const;

export type EmailSettingsTabId = (typeof EMAIL_SETTINGS_TAB_IDS)[number];

/** Tabs that render inside `/dashboard/settings/email`. */
export const EMAIL_SETTINGS_LOCAL_TAB_IDS = EMAIL_SETTINGS_TAB_IDS;

export type EmailSettingsLocalTabId = EmailSettingsTabId;

const LOCAL_TAB_SET = new Set<string>(EMAIL_SETTINGS_LOCAL_TAB_IDS);

/** Legacy query values that used to open other chips on this page. */
const LEGACY_TO_CANONICAL: Record<string, EmailSettingsLocalTabId> = {
  general: "connection",
  sending: "connection",
  assistant: "connection",
  "email-connection": "connection",
  "email-sending": "connection",
  "email-ai-assistant": "connection",
  "email-identity": "identity",
  routing: "connection",
  tickets: "connection",
  templates: "connection",
};

export function isEmailSettingsLocalTab(tab: string): tab is EmailSettingsLocalTabId {
  return LOCAL_TAB_SET.has(tab);
}

export function parseEmailSettingsTab(raw: string | null | undefined): EmailSettingsLocalTabId {
  if (!raw) return "connection";
  if (isEmailSettingsLocalTab(raw)) return raw;
  const mapped = LEGACY_TO_CANONICAL[raw];
  if (mapped) return mapped;
  return "connection";
}

/** Map legacy same-page hashes to the tab model. */
export function emailSettingsTabFromHash(hash: string | null | undefined): EmailSettingsLocalTabId | null {
  const normalized = (hash ?? "").replace(/^#/, "");
  if (!normalized) return null;
  if (normalized === "email-identity") return "identity";
  if (
    normalized === "email-connection" ||
    normalized === "email-sending" ||
    normalized === "email-ai-assistant"
  ) {
    return "connection";
  }
  return null;
}

export function resolveEmailSettingsTab(input: {
  search: string;
  hash?: string | null;
}): EmailSettingsLocalTabId {
  const query = input.search.startsWith("?") ? input.search.slice(1) : input.search;
  const params = new URLSearchParams(query);
  const fromQuery = params.get("tab");
  if (fromQuery) return parseEmailSettingsTab(fromQuery);
  const fromHash = emailSettingsTabFromHash(input.hash);
  if (fromHash) return fromHash;
  return "connection";
}

/** Nest-safe href for Email Settings local tabs (wouter `~` absolute). */
export function emailSettingsTabHref(tab: EmailSettingsTabId | string): string {
  // External destinations that used to appear as settings chips keep their real routes.
  if (tab === "routing") return "~/dashboard/email/ai-routing";
  if (tab === "tickets") return "~/dashboard/email/ai-routing#email-ticket-automation";
  if (tab === "templates") return "~/dashboard/email/templates";
  const canonical = parseEmailSettingsTab(tab);
  return `~/dashboard/settings/email?tab=${canonical}`;
}

export const EMAIL_SETTINGS_IDENTITY_HREF = emailSettingsTabHref("identity");
