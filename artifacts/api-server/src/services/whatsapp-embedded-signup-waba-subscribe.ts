/**
 * Isolated WABA → Meta app webhook subscription (STEP 9B).
 *
 * Basic subscribe only (empty POST body). No override_callback_uri.
 * Does not modify webhook routes, Cloudflare, or Meta Console.
 *
 * OUT OF SCOPE (separate future step):
 * - POST /{phone_number_id}/register (Cloud API phone registration)
 * - WABA callback URL override + verify-token handshake
 *
 * Persistence columns for a future additive migration (not applied here):
 * - webhook_subscription_status
 * - webhook_subscribed_at
 * - webhook_subscription_error
 * - webhook_subscription_app_id
 * - webhook_override_used
 * - last_subscribed_apps_check_at
 */

import {
  isWhatsAppEmbeddedSignupAllowProductionSubscribe,
  isWhatsAppEmbeddedSignupAutoSubscribeEnabled,
  isWhatsAppEmbeddedSignupProductionRuntime,
} from "./whatsapp-embedded-signup-flags.js";

export type WhatsAppWebhookSubscriptionStatus =
  | "skipped_flag_off"
  | "blocked_production"
  | "already_subscribed"
  | "subscribed"
  | "failed"
  | "pending_retry";

/** Shape ready for a later side-table migration — not written to DB in STEP 9B. */
export type WhatsAppWebhookSubscriptionPersistenceHint = {
  webhook_subscription_status: WhatsAppWebhookSubscriptionStatus;
  webhook_subscribed_at: string | null;
  webhook_subscription_error: string | null;
  webhook_subscription_app_id: string | null;
  webhook_override_used: false;
  last_subscribed_apps_check_at: string | null;
};

export type WhatsAppEmbeddedSignupSubscribeInput = {
  /** Customer WABA id from Embedded Signup (never a hard-coded production id). */
  wabaId: string;
  /** Customer-scoped token from ES code exchange only. */
  accessToken: string;
  /**
   * Kept for call-site compatibility. Unused for basic subscribe —
   * do not send override_callback_uri.
   */
  callbackUrl?: string;
  graphApiVersion: string;
  /** META_EMBEDDED_SIGNUP_APP_ID — the app that must appear on subscribed_apps. */
  targetAppId: string;
};

export type WhatsAppEmbeddedSignupSubscribeResult = {
  status: WhatsAppWebhookSubscriptionStatus;
  /** True when at least one Graph HTTP call was attempted. */
  attempted: boolean;
  /** True only for already_subscribed | subscribed (GET-verified). */
  ok: boolean;
  error: string | null;
  graphHttpStatus: number | null;
  graphErrorCode: number | null;
  graphIsTransient: boolean | null;
  attempts: number;
  persistenceHint: WhatsAppWebhookSubscriptionPersistenceHint;
};

export type WhatsAppWabaSubscribeDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  nowIso?: () => string;
  maxAttempts?: number;
  baseDelayMs?: number;
};

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    is_transient?: boolean;
  };
};

type GraphCallOk = {
  ok: true;
  httpStatus: number;
  payload: unknown;
};

type GraphCallFail = {
  ok: false;
  httpStatus: number;
  payload: GraphErrorBody;
  message: string;
  graphCode: number | null;
  isTransient: boolean;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPersistenceHint(input: {
  status: WhatsAppWebhookSubscriptionStatus;
  error: string | null;
  targetAppId: string | null;
  subscribedAt: string | null;
  checkedAt: string | null;
}): WhatsAppWebhookSubscriptionPersistenceHint {
  return {
    webhook_subscription_status: input.status,
    webhook_subscribed_at: input.subscribedAt,
    webhook_subscription_error: input.error,
    webhook_subscription_app_id: input.targetAppId,
    webhook_override_used: false,
    last_subscribed_apps_check_at: input.checkedAt,
  };
}

function resultOf(input: {
  status: WhatsAppWebhookSubscriptionStatus;
  attempted: boolean;
  ok: boolean;
  error: string | null;
  graphHttpStatus?: number | null;
  graphErrorCode?: number | null;
  graphIsTransient?: boolean | null;
  attempts?: number;
  targetAppId?: string | null;
  subscribedAt?: string | null;
  checkedAt?: string | null;
}): WhatsAppEmbeddedSignupSubscribeResult {
  return {
    status: input.status,
    attempted: input.attempted,
    ok: input.ok,
    error: input.error,
    graphHttpStatus: input.graphHttpStatus ?? null,
    graphErrorCode: input.graphErrorCode ?? null,
    graphIsTransient: input.graphIsTransient ?? null,
    attempts: input.attempts ?? 0,
    persistenceHint: buildPersistenceHint({
      status: input.status,
      error: input.error,
      targetAppId: input.targetAppId ?? null,
      subscribedAt: input.subscribedAt ?? null,
      checkedAt: input.checkedAt ?? null,
    }),
  };
}

function sanitizeGraphVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "v21.0";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function subscribedAppsUrl(graphApiVersion: string, wabaId: string): string {
  return `https://graph.facebook.com/${sanitizeGraphVersion(graphApiVersion)}/${encodeURIComponent(wabaId)}/subscribed_apps`;
}

/** Extract subscribed Meta App IDs from GET /subscribed_apps payloads. */
export function extractSubscribedAppIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const ids: string[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const nested = row.whatsapp_business_api_data;
    if (nested && typeof nested === "object") {
      const id = (nested as { id?: unknown }).id;
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
      continue;
    }
    if (typeof row.id === "string" && row.id.trim()) {
      ids.push(row.id.trim());
    }
  }
  return ids;
}

export function isTargetAppSubscribed(payload: unknown, targetAppId: string): boolean {
  const target = targetAppId.trim();
  if (!target) return false;
  return extractSubscribedAppIds(payload).includes(target);
}

function classifyGraphFailure(httpStatus: number, body: GraphErrorBody): {
  message: string;
  graphCode: number | null;
  isTransient: boolean;
  retryable: boolean;
} {
  const err = body.error ?? {};
  const graphCode = typeof err.code === "number" ? err.code : null;
  const message =
    (typeof err.message === "string" && err.message.trim()) ||
    `Meta Graph subscribed_apps failed (HTTP ${httpStatus})`;
  const flaggedTransient = err.is_transient === true;
  const rateLimited = graphCode === 80008 || httpStatus === 429;
  const serverError = httpStatus >= 500;
  const isTransient = flaggedTransient || rateLimited || serverError;
  // Permanent: 401, 403, Graph 200 (permissions), 400/100, 404 — do not retry.
  const permanent =
    httpStatus === 401 ||
    httpStatus === 403 ||
    httpStatus === 404 ||
    graphCode === 200 ||
    graphCode === 100 ||
    (httpStatus === 400 && !isTransient);
  return {
    message,
    graphCode,
    isTransient,
    retryable: isTransient && !permanent,
  };
}

async function graphSubscribedAppsCall(input: {
  method: "GET" | "POST";
  url: string;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<GraphCallOk | GraphCallFail> {
  // Bearer header only — never put the token in the URL (avoids log leakage).
  const init: RequestInit = {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  };
  if (input.method === "POST") {
    // Basic subscribe only — empty JSON body, no override_callback_uri / verify_token.
    init.headers = {
      ...init.headers,
      "Content-Type": "application/json",
    };
    init.body = "{}";
  }

  const response = await input.fetchImpl(input.url, init);
  const payload = (await response.json().catch(() => ({}))) as GraphErrorBody;
  if (!response.ok) {
    const classified = classifyGraphFailure(response.status, payload);
    return {
      ok: false,
      httpStatus: response.status,
      payload,
      message: classified.message,
      graphCode: classified.graphCode,
      isTransient: classified.isTransient,
    };
  }
  return { ok: true, httpStatus: response.status, payload };
}

function backoffMs(attemptIndex: number, baseDelayMs: number): number {
  const exp = baseDelayMs * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return exp + jitter;
}

/**
 * Ensure the Embedded Signup Meta App is subscribed to the customer WABA.
 * Idempotent: GET → (POST if needed) → GET verify. Success requires final GET.
 */
export async function maybeSubscribeWabaToWebhook(
  input: WhatsAppEmbeddedSignupSubscribeInput,
  deps: WhatsAppWabaSubscribeDeps = {},
): Promise<WhatsAppEmbeddedSignupSubscribeResult> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(1, deps.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);

  const wabaId = String(input.wabaId ?? "").trim();
  const accessToken = String(input.accessToken ?? "").trim();
  const targetAppId = String(input.targetAppId ?? "").trim();
  const graphApiVersion = sanitizeGraphVersion(String(input.graphApiVersion ?? ""));

  if (!isWhatsAppEmbeddedSignupAutoSubscribeEnabled()) {
    return resultOf({
      status: "skipped_flag_off",
      attempted: false,
      ok: false,
      error: null,
      targetAppId: targetAppId || null,
    });
  }

  if (
    isWhatsAppEmbeddedSignupProductionRuntime() &&
    !isWhatsAppEmbeddedSignupAllowProductionSubscribe()
  ) {
    return resultOf({
      status: "blocked_production",
      attempted: false,
      ok: false,
      error:
        "WABA subscription Graph calls are blocked in production until WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE=true.",
      targetAppId: targetAppId || null,
    });
  }

  if (!wabaId || !accessToken || !targetAppId) {
    return resultOf({
      status: "failed",
      attempted: false,
      ok: false,
      error: "wabaId, accessToken, and targetAppId are required for WABA subscription.",
      targetAppId: targetAppId || null,
    });
  }

  // callbackUrl intentionally unused — basic subscribe only (no override).
  void input.callbackUrl;

  const url = subscribedAppsUrl(graphApiVersion, wabaId);
  let attempts = 0;
  let lastFail: GraphCallFail | null = null;
  let lastCheckedAt: string | null = null;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
    attempts += 1;

    const listBefore = await graphSubscribedAppsCall({
      method: "GET",
      url,
      accessToken,
      fetchImpl,
    });
    lastCheckedAt = nowIso();

    if (!listBefore.ok) {
      lastFail = listBefore;
      const classified = classifyGraphFailure(listBefore.httpStatus, listBefore.payload);
      if (!classified.retryable || attemptIndex === maxAttempts - 1) {
        return resultOf({
          status: classified.retryable ? "pending_retry" : "failed",
          attempted: true,
          ok: false,
          error: listBefore.message,
          graphHttpStatus: listBefore.httpStatus,
          graphErrorCode: listBefore.graphCode,
          graphIsTransient: listBefore.isTransient,
          attempts,
          targetAppId,
          checkedAt: lastCheckedAt,
        });
      }
      await sleep(backoffMs(attemptIndex, baseDelayMs));
      continue;
    }

    if (isTargetAppSubscribed(listBefore.payload, targetAppId)) {
      return resultOf({
        status: "already_subscribed",
        attempted: true,
        ok: true,
        error: null,
        graphHttpStatus: listBefore.httpStatus,
        attempts,
        targetAppId,
        subscribedAt: lastCheckedAt,
        checkedAt: lastCheckedAt,
      });
    }

    const post = await graphSubscribedAppsCall({
      method: "POST",
      url,
      accessToken,
      fetchImpl,
    });

    if (!post.ok) {
      lastFail = post;
      const classified = classifyGraphFailure(post.httpStatus, post.payload);
      if (!classified.retryable || attemptIndex === maxAttempts - 1) {
        return resultOf({
          status: classified.retryable ? "pending_retry" : "failed",
          attempted: true,
          ok: false,
          error: post.message,
          graphHttpStatus: post.httpStatus,
          graphErrorCode: post.graphCode,
          graphIsTransient: post.isTransient,
          attempts,
          targetAppId,
          checkedAt: lastCheckedAt,
        });
      }
      await sleep(backoffMs(attemptIndex, baseDelayMs));
      continue;
    }

    // Never trust POST alone — verify with GET.
    const listAfter = await graphSubscribedAppsCall({
      method: "GET",
      url,
      accessToken,
      fetchImpl,
    });
    lastCheckedAt = nowIso();

    if (!listAfter.ok) {
      lastFail = listAfter;
      const classified = classifyGraphFailure(listAfter.httpStatus, listAfter.payload);
      if (!classified.retryable || attemptIndex === maxAttempts - 1) {
        return resultOf({
          status: classified.retryable ? "pending_retry" : "failed",
          attempted: true,
          ok: false,
          error: `Subscribe POST succeeded but verification GET failed: ${listAfter.message}`,
          graphHttpStatus: listAfter.httpStatus,
          graphErrorCode: listAfter.graphCode,
          graphIsTransient: listAfter.isTransient,
          attempts,
          targetAppId,
          checkedAt: lastCheckedAt,
        });
      }
      await sleep(backoffMs(attemptIndex, baseDelayMs));
      continue;
    }

    if (isTargetAppSubscribed(listAfter.payload, targetAppId)) {
      return resultOf({
        status: "subscribed",
        attempted: true,
        ok: true,
        error: null,
        graphHttpStatus: listAfter.httpStatus,
        attempts,
        targetAppId,
        subscribedAt: lastCheckedAt,
        checkedAt: lastCheckedAt,
      });
    }

    // POST claimed success but target app still absent — permanent verification failure.
    return resultOf({
      status: "failed",
      attempted: true,
      ok: false,
      error:
        "Subscribe POST returned success but target Meta App ID was not present on subsequent GET /subscribed_apps.",
      graphHttpStatus: listAfter.httpStatus,
      attempts,
      targetAppId,
      checkedAt: lastCheckedAt,
    });
  }

  return resultOf({
    status: "pending_retry",
    attempted: true,
    ok: false,
    error: lastFail?.message ?? "WABA subscription exhausted retry budget.",
    graphHttpStatus: lastFail?.httpStatus ?? null,
    graphErrorCode: lastFail?.graphCode ?? null,
    graphIsTransient: lastFail?.isTransient ?? true,
    attempts,
    targetAppId,
    checkedAt: lastCheckedAt,
  });
}
