/**
 * Client for AI quote send-request inbox APIs (human approve → QuoteSendService).
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import {
  QuoteSendClientError,
  type QuoteSendChannel,
  type QuoteSendResult,
} from "./quote-send-types";

export type QuoteSendRequestItem = {
  quoteId: string;
  quoteNumber: string;
  quoteStatus: string;
  title: string;
  contactName: string;
  grandTotal: number;
  currency: string;
  channel: QuoteSendChannel;
  requestedAt: string;
  requestedByUserId: string;
  conversationId: string | null;
  deliveryState: "pending_human_approval";
  sent: false;
};

export type QuoteSendRequestApproveResult = QuoteSendResult & {
  deliveryState: "sent" | "failed";
  sent: boolean;
};

export type QuoteSendRequestRejectResult = {
  quoteId: string;
  deliveryState: "draft";
  sent: false;
};

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
      const json = (await response.json()) as {
        error?: string;
        message?: string;
        details?: Record<string, unknown>;
      };
      code = json.error || code;
      message = json.message || json.error || message;
      details = json.details ?? {};
    } catch {
      // ignore
    }
    throw new QuoteSendClientError(response.status, code, message, details);
  }
  return (await response.json()) as T;
}

export function listQuoteSendRequests(input: {
  companyId: string;
}): Promise<QuoteSendRequestItem[]> {
  return postJson<{ items?: QuoteSendRequestItem[] }>("/quotes/send-requests", {
    companyId: input.companyId,
  }).then((body) => (Array.isArray(body.items) ? body.items : []));
}

export function approveQuoteSendRequest(input: {
  companyId: string;
  quoteId: string;
  channel?: QuoteSendChannel;
  idempotencyKey?: string;
  language?: string;
}): Promise<QuoteSendRequestApproveResult> {
  return postJson<QuoteSendRequestApproveResult>("/quotes/send-requests/approve", {
    companyId: input.companyId,
    quoteId: input.quoteId,
    channel: input.channel,
    idempotencyKey: input.idempotencyKey,
    language: input.language,
  });
}

export function rejectQuoteSendRequest(input: {
  companyId: string;
  quoteId: string;
}): Promise<QuoteSendRequestRejectResult> {
  return postJson<QuoteSendRequestRejectResult>("/quotes/send-requests/reject", {
    companyId: input.companyId,
    quoteId: input.quoteId,
  });
}
