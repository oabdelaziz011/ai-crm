import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

export type ChannelAiAssignment = {
  companyId: string;
  companyChannelId: string;
  assignedAiEmployeeId: string | null;
};

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiJson<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  if (!isAuthenticatedApiConfigured()) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }
  const base = resolveAuthenticatedApiBase();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

export function fetchChannelAiAssignment(
  companyId: string,
  companyChannelId: string,
): Promise<ChannelAiAssignment> {
  const qs = new URLSearchParams({ companyId, companyChannelId });
  return apiJson("GET", `/channels/ai-assignment?${qs.toString()}`);
}

export function setChannelAiAssignment(input: {
  companyId: string;
  companyChannelId: string;
  assignedAiEmployeeId: string | null;
}): Promise<ChannelAiAssignment> {
  return apiJson("POST", "/channels/ai-assignment", input);
}
