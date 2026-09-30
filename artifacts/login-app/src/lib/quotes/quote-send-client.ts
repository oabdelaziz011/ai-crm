/**
 * Client for POST /quotes/send-options and POST /quotes/send (api-server).
 * Delivery happens server-side through Email Workspace / WhatsApp Cloud — never mailto / wa.me.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import {
  QuoteSendClientError,
  type QuoteSendChannel,
  type QuoteSendOptions,
  type QuoteSendResult,
} from "./quote-send-types";

export * from "./quote-send-types";

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken({ forceRefresh });
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) throw new Error("API base URL is not configured");
  const payload = JSON.stringify(body);
  const postOnce = async (forceRefresh: boolean) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: await authHeaders(forceRefresh),
      credentials: "include",
      body: payload,
    });

  let response = await postOnce(false);
  if (response.status === 401) response = await postOnce(true);

  if (!response.ok) {
    let code = "request_failed";
    let message = "Request failed";
    let details: Record<string, unknown> = {};
    try {
      const json = (await response.json()) as { error?: string; message?: string; details?: Record<string, unknown> };
      code = json.error || code;
      message = json.message || json.error || message;
      details = json.details ?? {};
    } catch {
      // ignore non-JSON bodies
    }
    throw new QuoteSendClientError(response.status, code, message, details);
  }
  return (await response.json()) as T;
}

export function requestQuoteSendOptions(input: { companyId: string; quoteId: string }): Promise<QuoteSendOptions> {
  return postJson<QuoteSendOptions>("/quotes/send-options", input);
}

export function requestQuoteSend(input: {
  companyId: string;
  quoteId: string;
  channel: QuoteSendChannel;
  idempotencyKey: string;
  language?: string;
}): Promise<QuoteSendResult> {
  return postJson<QuoteSendResult>("/quotes/send", input);
}
