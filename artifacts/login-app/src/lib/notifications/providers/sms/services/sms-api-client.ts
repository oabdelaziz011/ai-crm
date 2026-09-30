import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function isSmsApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}

export async function processSmsQueue(companyId: string): Promise<{
  processed: number;
  completed: number;
  failed: number;
}> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}/api/sms/process-queue`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    body: JSON.stringify({ companyId }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    processed?: number;
    completed?: number;
    failed?: number;
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `SMS process-queue failed (${response.status})`);
  }

  return {
    processed: Number(body.processed ?? 0),
    completed: Number(body.completed ?? 0),
    failed: Number(body.failed ?? 0),
  };
}
