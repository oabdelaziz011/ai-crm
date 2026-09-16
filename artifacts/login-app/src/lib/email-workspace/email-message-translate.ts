/**
 * Email message translation API client.
 * Read-only. Never sends mail or mutates conversation state.
 */
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import { resolveAuthenticatedApiBase } from "@/lib/api-server/normalize-api-base";
import {
  getCachedEmailTranslation,
  setCachedEmailTranslation,
  type EmailMessageTranslationResult,
} from "@/lib/email-workspace/email-message-translate-shared";

export * from "@/lib/email-workspace/email-message-translate-shared";

export class EmailMessageTranslateAuthError extends Error {
  readonly code = "session_expired" as const;
  constructor(message = "Invalid or expired session.") {
    super(message);
    this.name = "EmailMessageTranslateAuthError";
  }
}

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getFreshAccessToken({ forceRefresh });
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function isAuthFailureMessage(message: string): boolean {
  return /invalid or expired session|authentication required|session expired|unauthorized/i.test(
    message,
  );
}

export async function requestEmailMessageTranslation(input: {
  companyId: string;
  messageId: string;
  targetLanguage: string;
  bypassCache?: boolean;
}): Promise<EmailMessageTranslationResult> {
  if (!input.bypassCache) {
    const cached = getCachedEmailTranslation(input.messageId, input.targetLanguage);
    if (cached) return cached;
  }

  const base = resolveAuthenticatedApiBase();
  if (!base) throw new Error("API base URL is not configured");

  const payload = JSON.stringify({
    companyId: input.companyId,
    targetLanguage: input.targetLanguage,
  });

  const postOnce = async (forceRefresh: boolean) =>
    fetch(`${base}/email/messages/${encodeURIComponent(input.messageId)}/translate`, {
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
    let message = "Translation failed";
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      message = json.message || json.error || message;
    } catch {
      // ignore
    }
    if (response.status === 401 || isAuthFailureMessage(message)) {
      throw new EmailMessageTranslateAuthError(message);
    }
    throw new Error(message);
  }

  const json = (await response.json()) as EmailMessageTranslationResult;
  if (!json.translatedText?.trim()) {
    throw new Error("Translation failed");
  }
  const result: EmailMessageTranslationResult = {
    sourceLanguage: json.sourceLanguage || "unknown",
    sourceLanguageLabel: json.sourceLanguageLabel || "Unknown",
    targetLanguage: json.targetLanguage || input.targetLanguage,
    translatedText: json.translatedText,
    truncated: Boolean(json.truncated),
    neverSend: true,
  };
  setCachedEmailTranslation(input.messageId, input.targetLanguage, result);
  return result;
}
