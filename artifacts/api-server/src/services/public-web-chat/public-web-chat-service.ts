import {
  isPublicWebChatApiEnabled,
  PUBLIC_WEB_CHAT_LIMITS,
  publicWebChatVisitorCopy,
} from "./public-web-chat-config.js";
import { isWebChatOriginAllowed, normalizeWebChatOrigin } from "./public-web-chat-origin.js";
import { WEB_CHAT_RATE_LIMITS, type WebChatRateLimitStore } from "./public-web-chat-rate-limit.js";
import {
  PublicWebChatSessionLimitError,
  PublicWebChatUnavailableError,
  type PublicWebChatAuthorizedSession,
  type PublicWebChatRepository,
} from "./public-web-chat-repository.js";
import {
  generateVisitorId,
  generateVisitorToken,
  hashVisitorFingerprint,
  hashVisitorToken,
  isUuid,
  isWellFormedVisitorToken,
  isWellFormedWidgetKey,
} from "./public-web-chat-token.js";

export type PublicWebChatErrorCode =
  | "web_chat_unavailable"
  | "invalid_request"
  | "message_too_long"
  | "rate_limited"
  | "temporarily_unavailable";

export type PublicWebChatResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; error: PublicWebChatErrorCode; retryAfterSeconds?: number };

export type PublicWebChatSendOutcome = "replied" | "handoff" | "fallback" | "accepted";

export type PublicWebChatInboundPort = {
  routeVisitorMessage(input: {
    companyId: string;
    companyChannelId: string;
    conversationId: string;
    externalThreadId: string;
    externalMessageId: string;
    text: string;
    locale: string | null;
    executeAi: boolean;
    aiEmployeeId: string | null;
    requestId: string | null;
  }): Promise<{ incomingMessageId: string | null; responseContent: string | null; duplicate: boolean }>;
  isHumanOwned(input: { companyId: string; conversationId: string }): Promise<boolean>;
  requestHandoff(input: {
    companyId: string;
    conversationId: string;
    reason: string;
    triggerCode?: "customer_requested" | "repeated_failures";
  }): Promise<void>;
};

type ServiceLogger = {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
};

export type PublicWebChatServiceDeps = {
  repository: PublicWebChatRepository;
  inbound: PublicWebChatInboundPort;
  rateLimit: WebChatRateLimitStore;
  fingerprintSecret: string;
  /** Global switch (WEBHOOK_EXECUTE_AI); AI additionally needs the widget's own employee. */
  executeAi: boolean;
  logger?: ServiceLogger;
  isApiEnabled?: () => boolean;
  now?: () => number;
};

const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,100}$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/i;
// eslint-disable-next-line no-control-regex
const STRIP_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g;

export type NormalizedVisitorText =
  | { ok: true; text: string }
  | { ok: false; error: "invalid_request" | "message_too_long" };

export function normalizeVisitorText(raw: unknown): NormalizedVisitorText {
  if (typeof raw !== "string") return { ok: false, error: "invalid_request" };
  if (raw.length > PUBLIC_WEB_CHAT_LIMITS.maxMessageChars * 2) return { ok: false, error: "message_too_long" };
  const text = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(STRIP_CONTROL, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!text) return { ok: false, error: "invalid_request" };
  if ([...text].length > PUBLIC_WEB_CHAT_LIMITS.maxMessageChars) return { ok: false, error: "message_too_long" };
  return { ok: true, text };
}

export function normalizeVisitorLocale(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length <= 35 && LOCALE_PATTERN.test(trimmed) ? trimmed : null;
}

function parseNonNegativeInt(raw: unknown, fallback: number): number | null {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (!/^\d{1,15}$/.test(text)) return null;
  return Number(text);
}

const unavailable = (): PublicWebChatResult => ({ ok: false, status: 404, error: "web_chat_unavailable" });
const invalid = (error: "invalid_request" | "message_too_long" = "invalid_request"): PublicWebChatResult => ({
  ok: false,
  status: error === "message_too_long" ? 413 : 400,
  error,
});
const rateLimited = (retryAfterSeconds: number): PublicWebChatResult => ({
  ok: false,
  status: 429,
  error: "rate_limited",
  retryAfterSeconds,
});
const temporarilyUnavailable = (): PublicWebChatResult => ({
  ok: false,
  status: 503,
  error: "temporarily_unavailable",
});

function noticeFor(outcome: string | null | undefined, locale?: unknown): string | undefined {
  const copy = publicWebChatVisitorCopy(locale);
  if (outcome === "handoff") return copy.handoff;
  if (outcome === "fallback") return copy.aiFallback;
  if (outcome === "accepted") return copy.received;
  return undefined;
}

export function toPublicVisitorPollMessage(row: {
  sequence: number;
  sender: string;
  content: string;
  createdAt: string;
}): { sequence: number; sender: string; text: string; createdAt: string } {
  return { sequence: row.sequence, sender: row.sender, text: row.content, createdAt: row.createdAt };
}

function publicOutcome(outcome: string | null | undefined): PublicWebChatSendOutcome | null {
  return outcome === "replied" || outcome === "handoff" || outcome === "fallback" || outcome === "accepted"
    ? outcome
    : null;
}

function errorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message.slice(0, 300) };
  return { errorMessage: String(error).slice(0, 300) };
}

export function createPublicWebChatService(deps: PublicWebChatServiceDeps) {
  const apiEnabled = deps.isApiEnabled ?? (() => isPublicWebChatApiEnabled());
  const now = deps.now ?? (() => Date.now());
  const log = deps.logger;

  const consume = async (key: string, rule: { limit: number; windowMs: number }) =>
    deps.rateLimit.consume(key, rule.limit, rule.windowMs);

  const ipKey = (ip: string | null | undefined) =>
    hashVisitorFingerprint(ip, deps.fingerprintSecret) ?? "unknown";

  /** Token → session → widget → company. Availability + origin re-checked on every call. */
  const authorize = async (input: {
    sessionId: unknown;
    token: unknown;
    origin: string | null | undefined;
  }): Promise<PublicWebChatAuthorizedSession | null> => {
    if (!isUuid(input.sessionId) || !isWellFormedVisitorToken(input.token)) return null;
    const session = await deps.repository.authorizeSession(input.sessionId, hashVisitorToken(input.token));
    if (!session || !session.available) return null;
    if (!isWebChatOriginAllowed(input.origin, session.allowedOrigins)) return null;
    return session;
  };

  const guard = async (
    operation: string,
    run: () => Promise<PublicWebChatResult>,
  ): Promise<PublicWebChatResult> => {
    if (!apiEnabled()) return unavailable();
    try {
      return await run();
    } catch (error) {
      if (error instanceof PublicWebChatUnavailableError) return unavailable();
      log?.error({ publicWebChat: true, operation, ...errorSummary(error) }, "public web chat request failed");
      return temporarilyUnavailable();
    }
  };

  return {
    /** CORS preflight: returns the canonical origin to reflect, or null (neutral, no ACAO). */
    async preflightOrigin(
      input:
        | { kind: "session_create"; widgetKey: unknown; origin: string | null | undefined }
        | { kind: "session"; sessionId: unknown; origin: string | null | undefined },
    ): Promise<string | null> {
      if (!apiEnabled()) return null;
      const origin = normalizeWebChatOrigin(input.origin);
      if (!origin) return null;
      try {
        if (input.kind === "session_create") {
          if (!isWellFormedWidgetKey(input.widgetKey)) return null;
          const widget = await deps.repository.resolveWidget(input.widgetKey);
          return widget && isWebChatOriginAllowed(origin, widget.allowedOrigins) ? origin : null;
        }
        if (!isUuid(input.sessionId)) return null;
        const allowed = await deps.repository.sessionAllowedOrigins(input.sessionId);
        return isWebChatOriginAllowed(origin, allowed) ? origin : null;
      } catch (error) {
        log?.warn({ publicWebChat: true, operation: "preflight", ...errorSummary(error) }, "public web chat preflight failed");
        return null;
      }
    },

    async createSession(input: {
      widgetKey: unknown;
      origin: string | null | undefined;
      body: Record<string, unknown>;
      ip: string | null | undefined;
      userAgent: string | null | undefined;
    }): Promise<PublicWebChatResult> {
      return guard("create_session", async () => {
        if (!isWellFormedWidgetKey(input.widgetKey)) return unavailable();

        const ipHash = hashVisitorFingerprint(input.ip, deps.fingerprintSecret);

        const widget = await deps.repository.resolveWidget(input.widgetKey);
        if (!widget) return unavailable();
        if (!isWebChatOriginAllowed(input.origin, widget.allowedOrigins)) return unavailable();

        const burst = await consume(
          `session:burst:ip:${ipHash ?? "unknown"}`,
          WEB_CHAT_RATE_LIMITS.sessionCreateBurstPerIp,
        );
        if (!burst.allowed) return rateLimited(burst.retryAfterSeconds);
        const limit = await consume(`session:ip:${ipHash ?? "unknown"}`, WEB_CHAT_RATE_LIMITS.sessionCreatePerIp);
        if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

        const widgetView = { greeting: widget.greeting };
        const resumeToken = input.body.visitor_token;
        if (isWellFormedVisitorToken(resumeToken)) {
          const resumed = await deps.repository.resumeSession(widget.widgetId, hashVisitorToken(resumeToken));
          if (resumed) {
            return {
              ok: true,
              status: 200,
              body: {
                session: { id: resumed.sessionId, expiresAt: resumed.expiresAt, resumed: true },
                widget: widgetView,
              },
            };
          }
        }

        const token = generateVisitorToken();
        try {
          const sessionId = await deps.repository.createSession({
            widgetId: widget.widgetId,
            tokenHash: hashVisitorToken(token),
            visitorId: generateVisitorId(),
            ipHash,
            userAgentHash: hashVisitorFingerprint(input.userAgent?.slice(0, 512), deps.fingerprintSecret),
            ttlSeconds: PUBLIC_WEB_CHAT_LIMITS.sessionTtlSeconds,
            maxActivePerIp: PUBLIC_WEB_CHAT_LIMITS.maxActiveSessionsPerIp,
          });
          return {
            ok: true,
            status: 201,
            body: {
              session: {
                id: sessionId,
                expiresAt: new Date(now() + PUBLIC_WEB_CHAT_LIMITS.sessionTtlSeconds * 1000).toISOString(),
                resumed: false,
              },
              visitorToken: token,
              widget: widgetView,
            },
          };
        } catch (error) {
          if (error instanceof PublicWebChatSessionLimitError) return rateLimited(60);
          throw error;
        }
      });
    },

    async sendMessage(input: {
      sessionId: unknown;
      token: unknown;
      origin: string | null | undefined;
      body: Record<string, unknown>;
      ip: string | null | undefined;
      requestId?: string | null;
    }): Promise<PublicWebChatResult> {
      return guard("send_message", async () => {
        if (!isUuid(input.sessionId) || !isWellFormedVisitorToken(input.token)) return unavailable();
        const clientMessageId = input.body.client_message_id;
        if (typeof clientMessageId !== "string" || !CLIENT_MESSAGE_ID_PATTERN.test(clientMessageId)) {
          return invalid();
        }
        const normalized = normalizeVisitorText(input.body.text);
        if (!normalized.ok) return invalid(normalized.error);
        const locale = normalizeVisitorLocale(input.body.locale);
        const copy = publicWebChatVisitorCopy(locale);

        // IP buckets run before token/origin auth by design: they protect the
        // authorize/RPC path from floods, do not confirm whether a token is
        // valid (429 vs 404 is not an existence oracle once the IP is hot),
        // and never consume session buckets without a valid session.
        const ipBurst = await consume(`message:burst:ip:${ipKey(input.ip)}`, WEB_CHAT_RATE_LIMITS.messageBurstPerIp);
        if (!ipBurst.allowed) return rateLimited(ipBurst.retryAfterSeconds);
        const ipLimit = await consume(`message:ip:${ipKey(input.ip)}`, WEB_CHAT_RATE_LIMITS.messagePerIp);
        if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterSeconds);

        const session = await authorize(input);
        if (!session) return unavailable();

        const sessionBurst = await consume(
          `message:burst:session:${session.sessionId}`,
          WEB_CHAT_RATE_LIMITS.messageBurstPerSession,
        );
        if (!sessionBurst.allowed) return rateLimited(sessionBurst.retryAfterSeconds);
        const sessionLimit = await consume(
          `message:session:${session.sessionId}`,
          WEB_CHAT_RATE_LIMITS.messagePerSession,
        );
        if (!sessionLimit.allowed) return rateLimited(sessionLimit.retryAfterSeconds);

        const claim = await deps.repository.claimMessage(session.sessionId, clientMessageId);
        if (!claim.claimed) {
          const outcome = publicOutcome(claim.outcome);
          return {
            ok: true,
            status: 200,
            body: {
              status: claim.status === "processing" ? "processing" : "duplicate",
              clientMessageId,
              ...(outcome ? { outcome } : {}),
              ...(noticeFor(outcome, locale) ? { notice: noticeFor(outcome, locale) } : {}),
            },
          };
        }

        const complete = async (
          status: "completed" | "failed",
          outcome: string,
          incomingMessageId: string | null,
        ) => {
          try {
            await deps.repository.completeMessage({
              submissionId: claim.submissionId,
              status,
              outcome,
              incomingMessageId,
            });
          } catch (error) {
            log?.error({ publicWebChat: true, operation: "complete_message", ...errorSummary(error) }, "public web chat ledger update failed");
          }
        };

        let binding;
        try {
          binding = await deps.repository.ensureConversation(session.sessionId);
        } catch (error) {
          await complete("failed", "unavailable", null);
          throw error;
        }

        const externalMessageId = `webchat:${session.sessionId}:${clientMessageId}`;
        const requestHuman = input.body.request_human === true;
        const executeAi =
          !requestHuman &&
          deps.executeAi &&
          session.config.aiEnabled !== false &&
          Boolean(session.aiEmployeeId);

        try {
          const routed = await deps.inbound.routeVisitorMessage({
            companyId: session.companyId,
            companyChannelId: session.companyChannelId,
            conversationId: binding.conversationId,
            externalThreadId: binding.externalThreadId,
            externalMessageId,
            text: normalized.text,
            locale,
            executeAi,
            aiEmployeeId: executeAi ? session.aiEmployeeId : null,
            requestId: input.requestId ?? null,
          });

          if (requestHuman) {
            try {
              await deps.inbound.requestHandoff({
                companyId: session.companyId,
                conversationId: binding.conversationId,
                reason: "public_web_chat_visitor_requested_human",
                triggerCode: "customer_requested",
              });
            } catch (handoffError) {
              log?.warn(
                { publicWebChat: true, operation: "request_handoff", ...errorSummary(handoffError) },
                "public web chat visitor handoff failed",
              );
              await complete("completed", "accepted", routed.incomingMessageId);
              return {
                ok: true,
                status: 200,
                body: { status: "accepted", clientMessageId, notice: copy.received },
              };
            }
            await complete("completed", "handoff", routed.incomingMessageId);
            return {
              ok: true,
              status: 200,
              body: { status: "handoff", clientMessageId, notice: copy.handoff },
            };
          }

          let outcome: PublicWebChatSendOutcome = "accepted";
          if (routed.responseContent?.trim()) {
            outcome = "replied";
          } else {
            const humanOwned = await deps.inbound
              .isHumanOwned({ companyId: session.companyId, conversationId: binding.conversationId })
              .catch(() => false);
            if (humanOwned) outcome = "handoff";
          }

          await complete("completed", outcome, routed.incomingMessageId);
          return {
            ok: true,
            status: 200,
            body: {
              status: outcome,
              clientMessageId,
              ...(noticeFor(outcome, locale) ? { notice: noticeFor(outcome, locale) } : {}),
            },
          };
        } catch (error) {
          log?.error(
            { publicWebChat: true, operation: "route_visitor_message", sessionId: session.sessionId, ...errorSummary(error) },
            "public web chat inbound processing failed",
          );

          const incomingMessageId = await deps.repository
            .findIncomingMessageId(binding.conversationId, externalMessageId)
            .catch(() => null);
          if (!incomingMessageId) {
            await complete("failed", "not_persisted", null);
            return temporarilyUnavailable();
          }
          if (!executeAi) {
            await complete("completed", "accepted", incomingMessageId);
            return {
              ok: true,
              status: 200,
              body: { status: "accepted", clientMessageId, notice: copy.received },
            };
          }

          try {
            await deps.repository.recordFallback(
              session.sessionId,
              clientMessageId,
              copy.aiFallback,
            );
          } catch (fallbackError) {
            log?.error({ publicWebChat: true, operation: "record_fallback", ...errorSummary(fallbackError) }, "public web chat fallback persist failed");
          }
          if (session.config.handoffOnAiFailure !== false) {
            try {
              await deps.inbound.requestHandoff({
                companyId: session.companyId,
                conversationId: binding.conversationId,
                reason: "public_web_chat_ai_failure",
              });
            } catch (handoffError) {
              log?.warn({ publicWebChat: true, operation: "request_handoff", ...errorSummary(handoffError) }, "public web chat fallback handoff failed");
            }
          }
          await complete("completed", "fallback", incomingMessageId);
          return {
            ok: true,
            status: 200,
            body: { status: "fallback", clientMessageId, notice: copy.aiFallback },
          };
        }
      });
    },

    async listMessages(input: {
      sessionId: unknown;
      token: unknown;
      origin: string | null | undefined;
      after: unknown;
      limit: unknown;
      ip: string | null | undefined;
    }): Promise<PublicWebChatResult> {
      return guard("list_messages", async () => {
        if (!isUuid(input.sessionId) || !isWellFormedVisitorToken(input.token)) return unavailable();
        const after = parseNonNegativeInt(input.after, 0);
        const requestedLimit = parseNonNegativeInt(input.limit, PUBLIC_WEB_CHAT_LIMITS.readPageSize);
        if (after === null || requestedLimit === null) return invalid();
        const limit = Math.min(Math.max(requestedLimit, 1), PUBLIC_WEB_CHAT_LIMITS.readPageMax);

        const ipLimit = await consume(`read:ip:${ipKey(input.ip)}`, WEB_CHAT_RATE_LIMITS.readPerIp);
        if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterSeconds);

        const session = await authorize(input);
        if (!session) return unavailable();

        const sessionLimit = await consume(`read:session:${session.sessionId}`, WEB_CHAT_RATE_LIMITS.readPerSession);
        if (!sessionLimit.allowed) return rateLimited(sessionLimit.retryAfterSeconds);
        if (!session.conversationId) {
          return { ok: true, status: 200, body: { messages: [], nextAfter: after } };
        }

        const rows = await deps.repository.listMessages(session.sessionId, after, limit);
        return {
          ok: true,
          status: 200,
          body: {
            messages: rows.map(toPublicVisitorPollMessage),
            nextAfter: rows.length ? rows[rows.length - 1]!.sequence : after,
          },
        };
      });
    },
  };
}

export type PublicWebChatService = ReturnType<typeof createPublicWebChatService>;
