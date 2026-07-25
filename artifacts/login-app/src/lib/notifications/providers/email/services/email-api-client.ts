function getApiBaseUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  const base = runtimeEnv.VITE_API_SERVER_URL?.trim() ?? "";
  return base.replace(/\/$/, "");
}

async function postEmailApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Email API failed (${response.status})`);
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

export function fetchEmailHealth(companyId: string): Promise<EmailHealthResponse> {
  return postEmailApi<EmailHealthResponse>("/email/health", { companyId });
}

export function testEmailConnection(companyId: string, recipientEmail: string) {
  return postEmailApi("/email/test-connection", { companyId, recipientEmail });
}

export function processEmailQueue(companyId: string) {
  return postEmailApi("/email/process-queue", { companyId });
}

export function isEmailApiConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}
