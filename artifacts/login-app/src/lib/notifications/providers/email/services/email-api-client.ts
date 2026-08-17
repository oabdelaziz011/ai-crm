import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function postEmailApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Email API failed (${response.status})`);
  }
  return payload;
}

export type EmailHealthResponse = {
  ok: boolean;
  provider: string;
  latencyMs: number;
  enabled: boolean;
  error?: string;
};

export type EmailChannelOutboundHealthResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  credentialSource: "company_email_settings";
  smtp: {
    host: string;
    port: number;
    fromEmail: string;
    verified: boolean;
    error?: string;
  };
  imap?: {
    host: string;
    port: number;
    mailbox?: string;
    configured: boolean;
  };
};

export type EmailPollInboxResponse = {
  ok: boolean;
  processed?: number;
  messages?: number;
  error?: string;
};

export function fetchEmailHealth(companyId: string): Promise<EmailHealthResponse> {
  return postEmailApi<EmailHealthResponse>("/email/health", { companyId });
}

export function fetchEmailChannelOutboundHealth(
  companyId: string,
  companyChannelId: string,
): Promise<EmailChannelOutboundHealthResponse> {
  return postEmailApi<EmailChannelOutboundHealthResponse>("/email/channel-outbound-health", {
    companyId,
    companyChannelId,
  });
}

export function pollEmailInbox(
  companyId: string,
  companyChannelId: string,
): Promise<EmailPollInboxResponse> {
  return postEmailApi<EmailPollInboxResponse>("/email/poll", {
    companyId,
    companyChannelId,
  });
}

export function testEmailConnection(companyId: string, recipientEmail: string) {
  return postEmailApi("/email/test-connection", { companyId, recipientEmail });
}

export type EmailTemplateTestSendResponse = {
  ok: true;
  templateId: string;
  templateCode: string;
  recipientEmail: string;
  subject: string;
  unresolved: string[];
};

export function testSendEmailTemplate(input: {
  companyId: string;
  templateId: string;
  recipientEmail: string;
}): Promise<EmailTemplateTestSendResponse> {
  return postEmailApi<EmailTemplateTestSendResponse>("/email/templates/test-send", {
    companyId: input.companyId,
    templateId: input.templateId,
    recipientEmail: input.recipientEmail,
  });
}

export function processEmailQueue(companyId: string) {
  return postEmailApi("/email/process-queue", { companyId });
}

export function isEmailApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}
