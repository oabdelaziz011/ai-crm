/**
 * Client for POST /email/ai/draft — draft only, never send.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import { shouldApplyEmailAiDraft } from "@/lib/email-workspace/email-ai-write-guards";

export type EmailAiWriteMode = "generate" | "rewrite";
export type EmailAiWriteTone = "professional" | "formal" | "friendly" | "concise";
export type EmailAiWriteResolvedLanguage = "ar" | "en" | "fr" | "de" | "es";
export type EmailAiWriteLanguage = "auto" | EmailAiWriteResolvedLanguage;

export type EmailAiDraftResponse = {
  subject: string;
  body: string;
  language: EmailAiWriteResolvedLanguage;
  tone: EmailAiWriteTone;
  neverSend?: boolean;
};

export { shouldApplyEmailAiDraft };

export class EmailAiWriteAuthError extends Error {
  readonly code = "session_expired" as const;

  constructor(message = "Invalid or expired session.") {
    super(message);
    this.name = "EmailAiWriteAuthError";
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

export async function requestEmailAiDraft(input: {
  companyId: string;
  instruction: string;
  mode: EmailAiWriteMode;
  outputLanguage: EmailAiWriteLanguage;
  tone: EmailAiWriteTone;
  subject?: string;
  body?: string;
  conversationId?: string;
  updateSubject?: boolean;
  /** True when Brand Center has a managed company signature (composer appends it separately). */
  hasExistingSignature?: boolean;
}): Promise<EmailAiDraftResponse> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("API base URL is not configured");
  }

  const payload = JSON.stringify({
    companyId: input.companyId,
    instruction: input.instruction,
    mode: input.mode,
    outputLanguage: input.outputLanguage,
    tone: input.tone,
    subject: input.subject ?? "",
    body: input.body ?? "",
    conversationId: input.conversationId,
    updateSubject: input.updateSubject ?? false,
    // Explicit boolean only — never send signature HTML to the API/LLM.
    hasExistingSignature: input.hasExistingSignature === true,
  });

  const postOnce = async (forceRefresh: boolean) =>
    fetch(`${base}/email/ai/draft`, {
      method: "POST",
      headers: await authHeaders(forceRefresh),
      credentials: "include",
      body: payload,
    });

  let response = await postOnce(false);
  // Stale cached JWT: refresh once and retry before surfacing session errors.
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
      throw new EmailAiWriteAuthError(message);
    }
    throw new Error(message);
  }

  const json = (await response.json()) as EmailAiDraftResponse;
  return {
    subject: typeof json.subject === "string" ? json.subject : "",
    body: typeof json.body === "string" ? json.body : "",
    language:
      json.language === "ar" ||
      json.language === "fr" ||
      json.language === "de" ||
      json.language === "es"
        ? json.language
        : "en",
    tone: json.tone ?? input.tone,
    neverSend: true,
  };
}
