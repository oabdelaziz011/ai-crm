/**
 * Canonical EmailProviderAdapter — provider-specific behavior stays behind this port.
 * Email Workspace / pipelines never branch on mailbox provider names.
 */

import type { EmailChannelConfiguration } from "./email-config.js";
import type { EmailSmtpSendPayload, EmailSmtpSendResult, ParsedInboundEmail } from "./email-types.js";
import {
  EMAIL_PROVIDER_ERROR_CODES,
  type EmailMailboxProvider,
  type EmailProviderCapabilities,
  type EmailProviderTestResult,
  resolveEmailProviderCapabilities,
} from "./email-provider-contract.js";
import { mapEmailProviderError } from "./email-provider-errors.js";
import { EmailSmtpClient } from "./email-smtp-client.js";
import { MicrosoftGraphEmailClient } from "./microsoft-graph-email-client.js";

export type EmailProviderAdapter = {
  readonly mailboxProvider: EmailMailboxProvider;
  capabilities(): EmailProviderCapabilities;
  testConnection(
    config: EmailChannelConfiguration,
    stage: "incoming" | "outgoing" | "full" | "oauth",
  ): Promise<EmailProviderTestResult>;
  sendMessage(
    config: EmailChannelConfiguration,
    payload: EmailSmtpSendPayload,
  ): Promise<EmailSmtpSendResult>;
  fetchMessages?(input: {
    config: EmailChannelConfiguration;
    cursor?: string | number;
    mailbox?: string;
  }): Promise<{ messages: ParsedInboundEmail[]; nextCursor: string | number }>;
};

export type ImapProbeFn = (config: EmailChannelConfiguration) => Promise<{ ok: boolean; error?: string }>;

export type CreateEmailProviderAdapterOptions = {
  smtpClient?: EmailSmtpClient;
  microsoftGraphClient?: MicrosoftGraphEmailClient;
  /** Optional live IMAP login probe (injected from api-server imapflow runtime). */
  imapProbe?: ImapProbeFn;
};

async function testSmtpOutgoing(
  smtpClient: EmailSmtpClient,
  config: EmailChannelConfiguration,
): Promise<EmailProviderTestResult> {
  const started = Date.now();
  if (!config.smtpHost?.trim()) {
    return {
      ok: false,
      stage: "outgoing",
      latencyMs: 0,
      errorCode: EMAIL_PROVIDER_ERROR_CODES.NOT_CONFIGURED,
    };
  }
  const verify = await smtpClient.verify(config);
  return {
    ok: verify.ok,
    stage: "outgoing",
    latencyMs: Date.now() - started,
    errorCode: verify.ok ? undefined : EMAIL_PROVIDER_ERROR_CODES.AUTH_INVALID,
  };
}

async function testImapIncoming(
  config: EmailChannelConfiguration,
  imapProbe?: ImapProbeFn,
): Promise<EmailProviderTestResult> {
  const started = Date.now();
  if (!config.imapHost?.trim()) {
    return {
      ok: false,
      stage: "incoming",
      latencyMs: 0,
      errorCode: EMAIL_PROVIDER_ERROR_CODES.NOT_CONFIGURED,
    };
  }
  if (!imapProbe) {
    // Without a probe, report configured-but-unverified (safe for unit tests / partial health).
    return {
      ok: Boolean(config.imapUsername && (config.imapPassword || config.smtpPassword)),
      stage: "incoming",
      latencyMs: Date.now() - started,
      errorCode: undefined,
    };
  }
  try {
    const result = await imapProbe(config);
    return {
      ok: result.ok,
      stage: "incoming",
      latencyMs: Date.now() - started,
      errorCode: result.ok ? undefined : EMAIL_PROVIDER_ERROR_CODES.AUTH_INVALID,
    };
  } catch (error) {
    const mapped = mapEmailProviderError(error);
    return { ok: false, stage: "incoming", latencyMs: Date.now() - started, errorCode: mapped.code };
  }
}

function createImapSmtpFamilyAdapter(
  mailboxProvider: "gmail" | "imap_smtp",
  options: CreateEmailProviderAdapterOptions,
): EmailProviderAdapter {
  const smtpClient = options.smtpClient ?? new EmailSmtpClient();
  return {
    mailboxProvider,
    capabilities: () => resolveEmailProviderCapabilities(mailboxProvider),
    async testConnection(config, stage) {
      if (stage === "oauth") {
        return { ok: false, stage, latencyMs: 0, errorCode: EMAIL_PROVIDER_ERROR_CODES.NOT_CONFIGURED };
      }
      if (stage === "outgoing") return testSmtpOutgoing(smtpClient, config);
      if (stage === "incoming") return testImapIncoming(config, options.imapProbe);
      const outgoing = await testSmtpOutgoing(smtpClient, config);
      if (!outgoing.ok) return { ...outgoing, stage: "full" };
      const incoming = await testImapIncoming(config, options.imapProbe);
      return {
        ok: outgoing.ok && incoming.ok,
        stage: "full",
        latencyMs: outgoing.latencyMs + incoming.latencyMs,
        errorCode: incoming.ok ? undefined : incoming.errorCode,
      };
    },
    async sendMessage(config, payload) {
      return smtpClient.send(config, payload);
    },
  };
}

function createMicrosoft365Adapter(options: CreateEmailProviderAdapterOptions): EmailProviderAdapter {
  const graph = options.microsoftGraphClient ?? new MicrosoftGraphEmailClient();
  return {
    mailboxProvider: "microsoft_365",
    capabilities: () => resolveEmailProviderCapabilities("microsoft_365"),
    async testConnection(config, stage) {
      const started = Date.now();
      const token = config.oauthAccessToken?.trim() || "";
      if (!token) {
        return {
          ok: false,
          stage: stage === "full" ? "full" : "oauth",
          latencyMs: 0,
          errorCode: EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED,
        };
      }
      if (stage === "incoming" || stage === "outgoing") {
        // Graph uses one OAuth credential for both directions.
        return { ok: true, stage, latencyMs: Date.now() - started };
      }
      try {
        await graph.listInboxMessages({ accessToken: token }, { top: 1 });
        return { ok: true, stage: stage === "oauth" ? "oauth" : "full", latencyMs: Date.now() - started };
      } catch (error) {
        const mapped = mapEmailProviderError(error);
        return {
          ok: false,
          stage: stage === "oauth" ? "oauth" : "full",
          latencyMs: Date.now() - started,
          errorCode: mapped.code,
        };
      }
    },
    async sendMessage(config, payload) {
      const accessToken = config.oauthAccessToken?.trim() || "";
      if (!accessToken) {
        throw new Error(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
      }
      return graph.send({ accessToken, fromEmail: config.fromEmail }, payload);
    },
  };
}

/** Resolve the adapter for a mailbox provider (factory — no workspace branching). */
export function createEmailProviderAdapter(
  mailboxProvider: EmailMailboxProvider,
  options: CreateEmailProviderAdapterOptions = {},
): EmailProviderAdapter {
  switch (mailboxProvider) {
    case "microsoft_365":
      return createMicrosoft365Adapter(options);
    case "gmail":
      return createImapSmtpFamilyAdapter("gmail", options);
    case "imap_smtp":
    default:
      return createImapSmtpFamilyAdapter("imap_smtp", options);
  }
}

/**
 * Resolve adapter from runtime config (outbound/inbound providers + mailboxProvider).
 * Prefer explicit mailboxProvider; fall back to microsoft_graph / smtp heuristics.
 */
export function resolveEmailProviderAdapterFromConfig(
  config: EmailChannelConfiguration,
  options: CreateEmailProviderAdapterOptions = {},
): EmailProviderAdapter {
  const explicit = String(config.mailboxProvider ?? "").trim();
  if (explicit === "gmail" || explicit === "microsoft_365" || explicit === "imap_smtp") {
    return createEmailProviderAdapter(explicit, options);
  }
  if (config.outboundProvider === "microsoft_graph" || config.inboundProvider === "microsoft_graph") {
    return createEmailProviderAdapter("microsoft_365", options);
  }
  const host = `${config.smtpHost ?? ""} ${config.imapHost ?? ""}`.toLowerCase();
  if (host.includes("gmail.com")) {
    return createEmailProviderAdapter("gmail", options);
  }
  return createEmailProviderAdapter("imap_smtp", options);
}
