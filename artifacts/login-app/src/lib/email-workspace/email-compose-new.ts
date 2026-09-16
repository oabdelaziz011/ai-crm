/**
 * New Email / compose helpers for the existing Email Workspace.
 * Does not create a second composer, draft store, or outbound pipeline.
 */
import {
  EMAIL_COMPOSER_DRAFT_METADATA_KEY,
  EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
  parseRecipientList,
  type EmailComposerDraftState,
} from "@/lib/email-workspace/email-thread-outbound";
import { customerEmailMatchesEmailSender } from "@workspace/ai-tool-router";

export const EMAIL_COMPOSE_ORIGIN_KEY = "emailComposeOrigin" as const;
export const EMAIL_COMPOSE_ORIGIN = "new_email" as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NewEmailStartReason =
  | "unauthenticated"
  | "no_company"
  | "not_entitled"
  | "rbac"
  | "no_channel"
  | "no_assistant";

export type NewEmailSendReason =
  | "missing_to"
  | "invalid_to"
  | "missing_subject"
  | "missing_body"
  | "unresolved_template"
  | "uploading"
  | "recipient_limit";

export function isValidComposerEmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at >= email.length - 1 || email.includes(" ")) return false;
  return EMAIL_RE.test(email);
}

export function invalidComposerAddresses(
  value: string | string[] | null | undefined,
): string[] {
  return parseRecipientList(value).filter((item) => !isValidComposerEmailAddress(item));
}

export function evaluateNewEmailStart(input: {
  userId: string | null | undefined;
  companyId: string | null | undefined;
  emailChannelEntitled: boolean;
  hasReplyPermission: boolean;
  isSuperAdmin: boolean;
  emailCompanyChannelId: string | null | undefined;
  assistantId: string | null | undefined;
}): { ok: true } | { ok: false; reason: NewEmailStartReason } {
  if (!input.userId) return { ok: false, reason: "unauthenticated" };
  if (!input.companyId) return { ok: false, reason: "no_company" };
  if (!input.emailChannelEntitled) return { ok: false, reason: "not_entitled" };
  if (!input.isSuperAdmin && !input.hasReplyPermission) return { ok: false, reason: "rbac" };
  if (!input.emailCompanyChannelId) return { ok: false, reason: "no_channel" };
  if (!input.assistantId) return { ok: false, reason: "no_assistant" };
  return { ok: true };
}

/**
 * Resolve the company AI assistant FK required by conversation create.
 *
 * This is NOT an AI Copilot / Write entitlement check. Conversations require
 * `ai_assistant_id` as a schema FK. Email agents often lack `ai_assistant.view`,
 * so `ai_assistant_settings` may be unreadable under RLS even when a settings
 * row exists. Prefer settings when readable; otherwise reuse an assistant id
 * already present on company conversations (unfiltered list — never a
 * metric-filtered workspace view).
 */
export function resolveNewEmailAssistantId(input: {
  companyId: string | null | undefined;
  settingsAssistantId?: string | null;
  /** Unfiltered company conversation rows (include metric-hidden threads). */
  conversations: Array<{
    company_id?: string | null;
    ai_assistant_id?: string | null;
  }>;
}): string | null {
  const fromSettings = input.settingsAssistantId?.trim() || null;
  if (fromSettings) return fromSettings;
  const companyId = input.companyId?.trim() || null;
  if (!companyId) return null;
  for (const row of input.conversations) {
    if (row.company_id !== companyId) continue;
    const id = row.ai_assistant_id?.trim() || null;
    if (id) return id;
  }
  return null;
}

export function shouldProvisionCompanyEmailChannel(input: {
  existingChannelId: string | null | undefined;
  fromEmail: string | null | undefined;
  settingsReady?: boolean;
}): boolean {
  if (input.existingChannelId) return false;
  if (input.settingsReady === false) return false;
  return Boolean(input.fromEmail?.trim());
}

export function buildCompanyEmailChannelCreateInput(input: {
  companyId: string;
  emailChannelTypeId: string;
  fromEmail: string;
  fromName?: string | null;
}): {
  companyId: string;
  channelId: string;
  displayName: string;
  provider: "generic.email";
  isEnabled: true;
  status: "active";
  configuration: {
    fromEmail: string;
    credentialsSource: "company_email_settings";
  };
} {
  const fromEmail = input.fromEmail.trim();
  const fromName = input.fromName?.trim() || fromEmail;
  return {
    companyId: input.companyId,
    channelId: input.emailChannelTypeId,
    displayName: fromName,
    provider: "generic.email",
    isEnabled: true,
    status: "active",
    configuration: {
      fromEmail,
      credentialsSource: "company_email_settings",
    },
  };
}

export async function ensureCompanyEmailChannelForCompose(input: {
  companyId: string;
  existingChannelId: string | null | undefined;
  fromEmail: string | null | undefined;
  fromName?: string | null;
  settingsReady?: boolean;
  getEmailChannelType: () => Promise<{ id: string } | null>;
  createConnection: (payload: ReturnType<typeof buildCompanyEmailChannelCreateInput>) => Promise<{ id: string }>;
}): Promise<{ channelId: string } | { channelId: null; reason: "no_channel" | "no_email_type" }> {
  if (input.existingChannelId) return { channelId: input.existingChannelId };
  if (!shouldProvisionCompanyEmailChannel(input)) {
    return { channelId: null, reason: "no_channel" };
  }
  const emailType = await input.getEmailChannelType();
  if (!emailType?.id) return { channelId: null, reason: "no_email_type" };
  const created = await input.createConnection(
    buildCompanyEmailChannelCreateInput({
      companyId: input.companyId,
      emailChannelTypeId: emailType.id,
      fromEmail: input.fromEmail!,
      fromName: input.fromName,
    }),
  );
  if (!created?.id) return { channelId: null, reason: "no_channel" };
  return { channelId: created.id };
}

export function evaluateNewEmailSend(input: {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  attachmentCount?: number;
  uploading?: boolean;
  unresolvedTemplateTokens?: string[];
  maxRecipientsPerField?: number;
}): {
  ok: true;
} | {
  ok: false;
  reason: NewEmailSendReason;
  invalidAddresses?: string[];
  unresolvedTokens?: string[];
  field?: "to" | "cc" | "bcc";
  limit?: number;
} {
  if (input.uploading) return { ok: false, reason: "uploading" };

  const max = input.maxRecipientsPerField ?? EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD;
  const toList = parseRecipientList(input.to);
  const ccList = parseRecipientList(input.cc ?? []);
  const bccList = parseRecipientList(input.bcc ?? []);
  if (toList.length === 0) return { ok: false, reason: "missing_to" };

  if (toList.length > max) {
    return { ok: false, reason: "recipient_limit", field: "to", limit: max };
  }
  if (ccList.length > max) {
    return { ok: false, reason: "recipient_limit", field: "cc", limit: max };
  }
  if (bccList.length > max) {
    return { ok: false, reason: "recipient_limit", field: "bcc", limit: max };
  }

  const invalid = [
    ...invalidComposerAddresses(toList),
    ...invalidComposerAddresses(ccList),
    ...invalidComposerAddresses(bccList),
  ];
  if (invalid.length > 0) {
    return { ok: false, reason: "invalid_to", invalidAddresses: invalid };
  }

  if (!input.subject.trim()) return { ok: false, reason: "missing_subject" };
  if (!input.body.trim() && (input.attachmentCount ?? 0) <= 0) {
    return { ok: false, reason: "missing_body" };
  }

  const unresolved = (input.unresolvedTemplateTokens ?? []).filter(Boolean);
  if (unresolved.length > 0) {
    return { ok: false, reason: "unresolved_template", unresolvedTokens: unresolved };
  }
  return { ok: true };
}

export function isNewEmailComposeConversation(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  if (metadata[EMAIL_COMPOSE_ORIGIN_KEY] === EMAIL_COMPOSE_ORIGIN) return true;
  const draft = metadata[EMAIL_COMPOSER_DRAFT_METADATA_KEY];
  return Boolean(draft && typeof draft === "object" && (draft as { mode?: string }).mode === "compose");
}

export function buildNewEmailComposerDraft(input: {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  bodyHtml?: string;
  signature?: string;
  selectedChannelId?: string | null;
  updatedAt?: string;
}): EmailComposerDraftState {
  // Editable body stays free of signature; UI shows signature separately.
  const body = input.body ?? "";
  return {
    mode: "compose",
    to: parseRecipientList(input.to ?? []),
    cc: parseRecipientList(input.cc ?? []),
    bcc: parseRecipientList(input.bcc ?? []),
    subject: input.subject ?? "",
    body,
    bodyHtml: input.bodyHtml ?? (body ? undefined : ""),
    selectedChannelId: input.selectedChannelId ?? undefined,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    attachments: [],
  };
}

export function buildNewEmailConversationMetadata(input: {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  signature?: string;
  updatedAt?: string;
}): Record<string, unknown> {
  const draft = buildNewEmailComposerDraft(input);
  return {
    [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
    subject: draft.subject,
    source: "email_workspace_compose",
    [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: draft,
  };
}

export function buildNewEmailConversationCreateInput(input: {
  companyId: string;
  aiAssistantId: string;
  companyChannelId: string;
  customerId?: string | null;
  signature?: string;
  subject?: string;
}): {
  companyId: string;
  aiAssistantId: string;
  channelType: "email";
  companyChannelId: string;
  customerId?: string | null;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    aiAssistantId: input.aiAssistantId,
    channelType: "email",
    companyChannelId: input.companyChannelId,
    customerId: input.customerId ?? null,
    metadata: buildNewEmailConversationMetadata({
      subject: input.subject,
      signature: input.signature,
    }),
  };
}

export type ExactCustomerMatchCandidate = {
  id: string;
  companyId: string;
  email: string | null;
};

/**
 * Company-scoped exact email match only.
 * Never uses phone. Never guesses across companies. Ambiguous matches stay unlinked.
 */
export function pickExactCompanyCustomerMatch(input: {
  companyId: string;
  recipientEmail: string;
  candidates: ExactCustomerMatchCandidate[];
}): { customerId: string } | { customerId: null; reason: "none" | "ambiguous" | "invalid_email" } {
  const companyId = input.companyId.trim();
  const recipient = input.recipientEmail.trim();
  if (!companyId || !isValidComposerEmailAddress(recipient)) {
    return { customerId: null, reason: "invalid_email" };
  }

  const sameCompanyExact = input.candidates.filter((row) => {
    if (row.companyId !== companyId) return false;
    return customerEmailMatchesEmailSender(row.email, recipient);
  });

  if (sameCompanyExact.length === 0) return { customerId: null, reason: "none" };
  if (sameCompanyExact.length > 1) return { customerId: null, reason: "ambiguous" };
  return { customerId: sameCompanyExact[0]!.id };
}

export function formatCompanyFromIdentity(input: {
  fromName?: string | null;
  fromEmail?: string | null;
}): string {
  const email = input.fromEmail?.trim() ?? "";
  const name = input.fromName?.trim() ?? "";
  if (email && name) return `${name} <${email}>`;
  return email;
}

export function shouldShowComposeMode(input: {
  composerMode: string;
  conversationMetadata?: Record<string, unknown> | null;
}): boolean {
  return input.composerMode === "compose" || isNewEmailComposeConversation(input.conversationMetadata);
}

export type CompanyEmailChannelCandidate = {
  id: string;
  company_id: string;
  deleted_at?: string | null;
  is_enabled?: boolean | null;
  provider?: string | null;
  communication_channel?: { key?: string | null } | null;
  configuration?: Record<string, unknown> | null;
};

/** Public Email Workspace channel metadata — never includes credentials. */
export type EmailWorkspaceChannelPublic = {
  id: string;
  companyId: string;
  displayName?: string | null;
  isEnabled: boolean;
  fromEmail?: string | null;
  fromName?: string | null;
};

export function emailWorkspaceChannelToCandidate(
  channel: EmailWorkspaceChannelPublic,
): CompanyEmailChannelCandidate {
  const fromEmail = channel.fromEmail?.trim() || undefined;
  const fromName = channel.fromName?.trim() || undefined;
  return {
    id: channel.id,
    company_id: channel.companyId,
    deleted_at: null,
    is_enabled: channel.isEnabled,
    provider: "generic.email",
    communication_channel: { key: "email" },
    configuration: {
      channelKey: "email",
      credentialsSource: "company_email_settings",
      ...(fromEmail ? { fromEmail } : {}),
      ...(fromName ? { fromName } : {}),
    },
  };
}

function readChannelKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const EMAIL_CHANNEL_PROVIDERS = new Set(["email", "generic.email", "smtp"]);

function readConfigurationEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Company-scoped Email channel only. Does not invent a channel or grant entitlement. */
export function isCompanyEmailChannelRow(
  companyId: string,
  channel: CompanyEmailChannelCandidate,
): boolean {
  if (!companyId || channel.company_id !== companyId || channel.deleted_at) return false;
  if (readChannelKey(channel.communication_channel?.key) === "email") return true;
  if (readChannelKey(channel.configuration?.channelKey) === "email") return true;
  const provider = readChannelKey(channel.provider);
  if (EMAIL_CHANNEL_PROVIDERS.has(provider)) return true;
  if (readConfigurationEmail(channel.configuration?.fromEmail)) return true;
  if (readChannelKey(channel.configuration?.credentialsSource) === "company_email_settings") {
    return true;
  }
  return readChannelKey(channel.configuration?.outboundProvider) === "smtp";
}

/**
 * Pure New Email channel diagnosis used by startNewEmail.
 * Distinguishes loading from a real missing company Email channel.
 */
export function diagnoseNewEmailChannelAvailability(input: {
  companyId: string | null | undefined;
  channels: CompanyEmailChannelCandidate[];
  channelsReady: boolean;
  channelsFailed?: boolean;
  conversations: Array<{
    company_id?: string | null;
    company_channel_id?: string | null;
  }>;
  conversationsReady: boolean;
  settingsReady?: boolean;
  fromEmail?: string | null;
}):
  | { status: "pending"; reason: "loading" }
  | { status: "lookup_failed"; reason: "lookup_failed" }
  | { status: "ready"; reason: "ok"; channelId: string }
  | { status: "ready"; reason: "no_channel"; channelId: null } {
  const resolved = resolveNewEmailCompanyChannelId(input);
  if (resolved.status === "pending") return { status: "pending", reason: "loading" };
  if (resolved.status === "lookup_failed") return { status: "lookup_failed", reason: "lookup_failed" };
  if (resolved.channelId) return { status: "ready", reason: "ok", channelId: resolved.channelId };
  return { status: "ready", reason: "no_channel", channelId: null };
}

export type CompanyEmailSenderOption = {
  id: string;
  fromEmail: string;
  fromName: string;
  label: string;
};

/** List active, non-deleted company Email channels the user may select as From. */
export function listCompanyEmailSenderOptions(input: {
  companyId: string;
  channels: CompanyEmailChannelCandidate[];
  /** Fallback identity from company email settings when channel config lacks fromEmail. */
  settingsFromEmail?: string | null;
  settingsFromName?: string | null;
}): CompanyEmailSenderOption[] {
  const matches = input.channels.filter(
    (row) => isCompanyEmailChannelRow(input.companyId, row) && row.is_enabled !== false,
  );
  const options: CompanyEmailSenderOption[] = [];
  for (const row of matches) {
    const fromEmail =
      readConfigurationEmail(row.configuration?.fromEmail) ||
      readConfigurationEmail(input.settingsFromEmail) ||
      "";
    if (!fromEmail) continue;
    const fromName =
      (typeof row.configuration?.fromName === "string" && row.configuration.fromName.trim()) ||
      input.settingsFromName?.trim() ||
      fromEmail;
    options.push({
      id: row.id,
      fromEmail,
      fromName,
      label: formatCompanyFromIdentity({ fromName, fromEmail }),
    });
  }
  return options;
}

/**
 * Resolve selected From channel — never invents IDs, never accepts cross-company channels.
 * Falls back to the single available option or pickCompanyEmailChannel.
 */
export function resolveSelectedCompanyEmailChannelId(input: {
  companyId: string;
  channels: CompanyEmailChannelCandidate[];
  selectedChannelId?: string | null;
  settingsFromEmail?: string | null;
  settingsFromName?: string | null;
}): { channelId: string; option: CompanyEmailSenderOption } | null {
  const options = listCompanyEmailSenderOptions(input);
  if (options.length === 0) {
    const picked = pickCompanyEmailChannel({
      companyId: input.companyId,
      channels: input.channels,
    });
    if (!picked) return null;
    const fromEmail = readConfigurationEmail(input.settingsFromEmail) || "";
    if (!fromEmail) return null;
    const fromName = input.settingsFromName?.trim() || fromEmail;
    return {
      channelId: picked.id,
      option: {
        id: picked.id,
        fromEmail,
        fromName,
        label: formatCompanyFromIdentity({ fromName, fromEmail }),
      },
    };
  }
  if (input.selectedChannelId) {
    const match = options.find((row) => row.id === input.selectedChannelId);
    if (match) return { channelId: match.id, option: match };
  }
  const first = options[0]!;
  return { channelId: first.id, option: first };
}

export function pickCompanyEmailChannel(input: {
  companyId: string;
  channels: CompanyEmailChannelCandidate[];
}): { id: string } | null {
  const matches = input.channels.filter((row) => isCompanyEmailChannelRow(input.companyId, row));
  const enabled = matches.find((row) => row.is_enabled !== false);
  const chosen = enabled ?? matches[0];
  return chosen ? { id: chosen.id } : null;
}

export function resolveNewEmailCompanyChannelId(input: {
  companyId: string | null | undefined;
  channels: CompanyEmailChannelCandidate[];
  channelsReady: boolean;
  channelsFailed?: boolean;
  conversations: Array<{
    company_id?: string | null;
    company_channel_id?: string | null;
  }>;
  conversationsReady: boolean;
  settingsReady?: boolean;
  fromEmail?: string | null;
}):
  | { status: "pending" }
  | { status: "lookup_failed" }
  | { status: "ready"; channelId: string | null } {
  if (!input.companyId) return { status: "ready", channelId: null };

  const picked = input.channelsReady
    ? pickCompanyEmailChannel({
        companyId: input.companyId,
        channels: input.channels,
      })
    : null;
  if (picked) return { status: "ready", channelId: picked.id };

  const wantedFrom = readConfigurationEmail(input.fromEmail);
  if (input.channelsReady && wantedFrom) {
    const fromMatch = input.channels.find((row) => {
      if (row.company_id !== input.companyId || row.deleted_at) return false;
      return readConfigurationEmail(row.configuration?.fromEmail) === wantedFrom;
    });
    if (fromMatch) return { status: "ready", channelId: fromMatch.id };
  }

  const fallback = input.conversationsReady
    ? input.conversations.find(
        (row) => row.company_id === input.companyId && row.company_channel_id,
      )?.company_channel_id ?? null
    : null;
  if (fallback) return { status: "ready", channelId: fallback };

  if (!input.channelsReady) {
    if (input.channelsFailed && input.conversationsReady) return { status: "lookup_failed" };
    return { status: "pending" };
  }
  if (!input.conversationsReady) return { status: "pending" };
  if (input.settingsReady === false) return { status: "pending" };
  return { status: "ready", channelId: null };
}

/** Same insert shape as ChannelSessionRepository.createSession. */
export function buildEmailComposeSessionInsert(input: {
  companyId: string;
  companyChannelId: string;
  conversationId: string;
  fromEmail?: string | null;
}): {
  company_id: string;
  company_channel_id: string;
  conversation_id: string;
  channel_key: "email";
  external_thread_id: string;
  sender_external_id: string | null;
  metadata: Record<string, unknown>;
} {
  return {
    company_id: input.companyId,
    company_channel_id: input.companyChannelId,
    conversation_id: input.conversationId,
    channel_key: "email",
    external_thread_id: input.conversationId,
    sender_external_id: input.fromEmail?.trim() || null,
    metadata: { source: "email_workspace_compose" },
  };
}
