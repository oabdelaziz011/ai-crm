/**
 * Client for POST /tickets/ai/resolution-message — draft only, never send.
 * Reuses the same auth/token refresh pattern as Email AI Write.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";

export type TicketResolutionAiLanguage = "en" | "ar" | "fr" | "de" | "es";
export type TicketResolutionAiMode =
  | "generate"
  | "rewrite"
  | "shorter"
  | "more_formal"
  | "friendlier";
export type TicketResolutionAiTone = "professional" | "formal" | "friendly" | "concise";

export type TicketResolutionAiResponse = {
  body: string;
  language: TicketResolutionAiLanguage;
  tone: TicketResolutionAiTone;
  usedFallback?: boolean;
  neverSend?: boolean;
};

export class TicketResolutionAiAuthError extends Error {
  readonly code = "session_expired" as const;

  constructor(message = "Invalid or expired session.") {
    super(message);
    this.name = "TicketResolutionAiAuthError";
  }
}

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken({ forceRefresh });
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function isAuthFailureMessage(message: string): boolean {
  return /invalid or expired session|authentication required|session expired|unauthorized/i.test(
    message,
  );
}

export async function requestTicketResolutionAiDraft(input: {
  companyId: string;
  ticketId: string;
  conversationId?: string | null;
  outputLanguage: TicketResolutionAiLanguage;
  mode?: TicketResolutionAiMode;
  tone?: TicketResolutionAiTone;
  currentDraft?: string | null;
  fallbackTemplate?: string | null;
  instruction?: string | null;
}): Promise<TicketResolutionAiResponse> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("API base URL is not configured");
  }

  const payload = JSON.stringify({
    companyId: input.companyId,
    ticketId: input.ticketId,
    conversationId: input.conversationId ?? undefined,
    outputLanguage: input.outputLanguage,
    mode: input.mode ?? "generate",
    tone: input.tone ?? "professional",
    currentDraft: input.currentDraft ?? "",
    fallbackTemplate: input.fallbackTemplate ?? "",
    instruction: input.instruction ?? "",
  });

  const postOnce = async (forceRefresh: boolean) =>
    fetch(`${base}/tickets/ai/resolution-message`, {
      method: "POST",
      headers: await authHeaders(forceRefresh),
      credentials: "include",
      body: payload,
    });

  let response = await postOnce(false);
  if (response.status === 401) {
    response = await postOnce(true);
  }

  if (!response.ok) {
    let message = "AI draft failed";
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      message = json.message || json.error || message;
    } catch {
      // ignore
    }
    if (response.status === 401 || isAuthFailureMessage(message)) {
      throw new TicketResolutionAiAuthError(message);
    }
    throw new Error(message);
  }

  const json = (await response.json()) as TicketResolutionAiResponse;
  return {
    body: typeof json.body === "string" ? json.body : "",
    language:
      json.language === "ar" ||
      json.language === "fr" ||
      json.language === "de" ||
      json.language === "es"
        ? json.language
        : "en",
    tone: json.tone ?? input.tone ?? "professional",
    usedFallback: false,
    neverSend: true,
  };
}
