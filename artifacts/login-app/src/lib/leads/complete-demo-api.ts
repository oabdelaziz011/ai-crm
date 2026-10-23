/**
 * Client for POST /leads/:leadId/complete-demo (api-server).
 * Does not mutate Lead state in the browser — server owns the transition.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";

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
    const body = (await res.json()) as {
      message?: string;
      error?: string | { message?: string; code?: string };
      code?: string;
    };
    if (typeof body.error === "object" && body.error?.message) return body.error.message;
    if (typeof body.error === "string") return body.error;
    return body.message || body.code || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export type CompleteDemoResult = {
  ok: boolean;
  lead: {
    id: string;
    lifecycleStatus?: string;
  };
};

export async function completeSalesDemoRequest(leadId: string): Promise<CompleteDemoResult> {
  const path = `/leads/${encodeURIComponent(leadId)}/complete-demo`;
  let res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (res.status === 401) {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: await authHeaders(true),
    });
  }
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as CompleteDemoResult;
}
