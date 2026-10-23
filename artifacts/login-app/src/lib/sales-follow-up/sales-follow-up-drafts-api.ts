/**
 * Client for authenticated sales follow-up draft review APIs.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";

export type SalesFollowUpReviewStatus =
  | "pending_review"
  | "sent"
  | "failed"
  | "cancelled";

export type SalesFollowUpReviewItem = {
  jobId: string;
  companyId: string;
  leadId: string;
  conversationId: string | null;
  channel: string | null;
  attemptNumber: number;
  dueAt: string;
  createdAt: string | null;
  messageText: string;
  status: SalesFollowUpReviewStatus;
  lastOutcome: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  leadTitle: string | null;
  contactName: string | null;
  productInterestName: string | null;
  productInterestId: string | null;
  lifecycleStatus: string | null;
  isQualified: boolean | null;
};

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken({ forceRefresh });
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function apiBase(): string {
  const base = resolveAuthenticatedApiBase();
  if (!base) throw new Error("API base URL is not configured");
  return base;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string; code?: string };
    return body.message || body.error || body.code || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function listSalesFollowUpDrafts(input: {
  companyId: string;
  status?: SalesFollowUpReviewStatus | "all";
  limit?: number;
}): Promise<SalesFollowUpReviewItem[]> {
  const params = new URLSearchParams({
    companyId: input.companyId,
    status: input.status ?? "pending_review",
    limit: String(input.limit ?? 50),
  });
  const res = await fetch(`${apiBase()}/sales-follow-up/drafts?${params}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { items?: SalesFollowUpReviewItem[] };
  return Array.isArray(body.items) ? body.items : [];
}

export async function updateSalesFollowUpDraft(input: {
  companyId: string;
  jobId: string;
  messageText: string;
}): Promise<void> {
  const res = await fetch(`${apiBase()}/sales-follow-up/drafts/${encodeURIComponent(input.jobId)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ companyId: input.companyId, messageText: input.messageText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function approveSalesFollowUpDraft(input: {
  companyId: string;
  jobId: string;
  messageText?: string;
}): Promise<{ providerMessageId: string | null }> {
  const res = await fetch(
    `${apiBase()}/sales-follow-up/drafts/${encodeURIComponent(input.jobId)}/approve`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        companyId: input.companyId,
        messageText: input.messageText,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { providerMessageId?: string | null };
  return { providerMessageId: body.providerMessageId ?? null };
}

export async function rejectSalesFollowUpDraft(input: {
  companyId: string;
  jobId: string;
  reason?: string;
}): Promise<void> {
  const res = await fetch(
    `${apiBase()}/sales-follow-up/drafts/${encodeURIComponent(input.jobId)}/reject`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        companyId: input.companyId,
        reason: input.reason ?? "rejected_by_staff",
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function rescheduleSalesFollowUpDraft(input: {
  companyId: string;
  jobId: string;
  dueAt: string;
}): Promise<void> {
  const res = await fetch(
    `${apiBase()}/sales-follow-up/drafts/${encodeURIComponent(input.jobId)}/reschedule`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        companyId: input.companyId,
        dueAt: input.dueAt,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}
