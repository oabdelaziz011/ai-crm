/**
 * Local/test-only fake outbound dispatch for QuoteSendService.
 * Never touches SMTP, Meta, or any external network.
 *
 * Production must not import the process singleton unless
 * VALUEOR_ENV=local and VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1.
 */
import { randomUUID } from "node:crypto";
import type { DispatchInput, DispatchResult, QuoteSendPorts } from "./quote-send-service.js";

export type FakeQuoteSendDispatchMode = "success" | "fail" | "timeout";

export type FakeQuoteSendDispatchCall = {
  at: string;
  channelKey: string;
  companyId: string;
  quoteId: string | null;
  attemptId: string | null;
  recipientHint: string | null;
  textLength: number;
};

export type FakeQuoteSendDispatchController = {
  mode: FakeQuoteSendDispatchMode;
  /** Artificial delay before resolving (ms). */
  delayMs: number;
  failMessage: string;
  readonly calls: FakeQuoteSendDispatchCall[];
  reset(): void;
  setMode(mode: FakeQuoteSendDispatchMode, options?: { delayMs?: number; failMessage?: string }): void;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  stats(): {
    mode: FakeQuoteSendDispatchMode;
    delayMs: number;
    callCount: number;
    calls: FakeQuoteSendDispatchCall[];
  };
};

function readMetaString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createFakeQuoteSendDispatchController(
  initial: { mode?: FakeQuoteSendDispatchMode; delayMs?: number; failMessage?: string } = {},
): FakeQuoteSendDispatchController {
  const calls: FakeQuoteSendDispatchCall[] = [];
  let mode: FakeQuoteSendDispatchMode = initial.mode ?? "success";
  let delayMs = Math.max(0, initial.delayMs ?? 0);
  let failMessage = initial.failMessage ?? "fake_provider_failed";

  const controller: FakeQuoteSendDispatchController = {
    get mode() {
      return mode;
    },
    set mode(next) {
      mode = next;
    },
    get delayMs() {
      return delayMs;
    },
    set delayMs(next) {
      delayMs = Math.max(0, next);
    },
    get failMessage() {
      return failMessage;
    },
    set failMessage(next) {
      failMessage = next;
    },
    get calls() {
      return calls;
    },
    reset() {
      calls.length = 0;
      mode = "success";
      delayMs = 0;
      failMessage = "fake_provider_failed";
    },
    setMode(next, options) {
      mode = next;
      if (options?.delayMs != null) delayMs = Math.max(0, options.delayMs);
      if (options?.failMessage) failMessage = options.failMessage;
    },
    async dispatch(input) {
      const metadata = (input.metadata ?? {}) as Record<string, unknown>;
      calls.push({
        at: new Date().toISOString(),
        channelKey: input.channelKey,
        companyId: input.companyId,
        quoteId: readMetaString(metadata, "quoteId"),
        attemptId: readMetaString(metadata, "quoteSendAttemptId"),
        recipientHint:
          readMetaString(metadata, "recipientEmail") ?? readMetaString(metadata, "recipientPhone"),
        textLength: String(input.text ?? "").length,
      });

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (mode === "fail" || mode === "timeout") {
        const err = new Error(mode === "timeout" ? "fake_provider_timeout" : failMessage);
        (err as Error & { code?: string }).code =
          mode === "timeout" ? "FAKE_PROVIDER_TIMEOUT" : "FAKE_PROVIDER_FAILED";
        throw err;
      }

      // delivery_event_id is uuid in quote_send_attempts — use bare UUIDs only.
      return {
        deliveryEventId: randomUUID(),
        externalMessageId: randomUUID(),
        deliveryStatus: "sent",
      };
    },
    stats() {
      return {
        mode,
        delayMs,
        callCount: calls.length,
        calls: calls.map((c) => ({ ...c })),
      };
    },
  };

  return controller;
}

/** Stable fake channel ids — never used as real company_channels FKs (conversation create is stubbed). */
export const FAKE_QUOTE_SEND_EMAIL_CHANNEL_ID = "00000000-0000-4000-8000-00000000f001";
export const FAKE_QUOTE_SEND_WHATSAPP_CHANNEL_ID = "00000000-0000-4000-8000-00000000f002";

/**
 * Wrap real QuoteSendPorts so channel entitlement/routes succeed locally while
 * outbound goes only through the fake dispatcher (no SMTP/Meta).
 */
export function withLocalFakeQuoteSendPorts(
  ports: QuoteSendPorts,
  controller: FakeQuoteSendDispatchController,
): QuoteSendPorts {
  return {
    ...ports,
    async isChannelEntitled() {
      return true;
    },
    async findEmailChannel(companyId) {
      return {
        companyChannelId: FAKE_QUOTE_SEND_EMAIL_CHANNEL_ID,
        fromEmail: `noreply+${companyId.slice(0, 8)}@valueor-test.local`,
      };
    },
    async resolveWhatsAppRoute(_companyId, recipient) {
      const phone = recipient.phone?.trim() || "+201000000000";
      return {
        ok: true,
        companyChannelId: FAKE_QUOTE_SEND_WHATSAPP_CHANNEL_ID,
        conversationId: randomUUID(),
        channelSessionId: randomUUID(),
        externalThreadId: phone.replace(/\D/g, "") || "201000000000",
      };
    },
    async resolveRecipient(companyId, quote) {
      const base = await ports.resolveRecipient(companyId, quote);
      return {
        ...base,
        name: base.name?.trim() || quote.contactName?.trim() || "Fake Recipient",
        email: base.email?.trim() || "quote.recipient@valueor-test.local",
        phone: base.phone?.trim() || "+201000000000",
      };
    },
    async createEmailConversation() {
      const id = randomUUID();
      return {
        conversationId: id,
        channelSessionId: randomUUID(),
        externalThreadId: id,
      };
    },
    async completeAttempt(id, patch) {
      // Fake channel/conversation ids are not real FKs — persist attempt outcome without them.
      return ports.completeAttempt(id, {
        ...patch,
        companyChannelId: null,
        conversationId: null,
      });
    },
    dispatch: (input) => controller.dispatch(input),
  };
}

let processController: FakeQuoteSendDispatchController | null = null;

export function isLocalFakeQuoteSendProviderEnabled(): boolean {
  const env = String(process.env.VALUEOR_ENV ?? "")
    .trim()
    .toLowerCase();
  if (env !== "local" && env !== "localstack" && env !== "development") return false;
  return String(process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER ?? "").trim() === "1";
}

/** Process-wide controller for the running local API (browser + HTTP verify). */
export function getProcessFakeQuoteSendDispatchController(): FakeQuoteSendDispatchController {
  if (!processController) {
    const modeRaw = String(process.env.VALUEOR_QUOTE_SEND_FAKE_MODE ?? "success")
      .trim()
      .toLowerCase();
    const mode: FakeQuoteSendDispatchMode =
      modeRaw === "fail" || modeRaw === "timeout" ? modeRaw : "success";
    const delayMs = Number(process.env.VALUEOR_QUOTE_SEND_FAKE_DELAY_MS ?? "0");
    processController = createFakeQuoteSendDispatchController({
      mode,
      delayMs: Number.isFinite(delayMs) ? delayMs : 0,
    });
  }
  return processController;
}

/** Test helper — reset process singleton between suites. */
export function resetProcessFakeQuoteSendDispatchController(): void {
  processController = null;
}
