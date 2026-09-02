/**
 * Proactive WhatsApp session idle timeout policy.
 *
 * Given conversation_timeout_minutes = T (e.g. 6):
 * - At T/2: warn phase (no WhatsApp text — skipped by processor)
 * - At T: expire the automation session silently (no session-ended WhatsApp text)
 *
 * Tracking is keyed to lastActivityAt so a new customer message resets the cycle.
 */

export const SESSION_IDLE_TIMEOUT_METADATA_KEY = "sessionIdleTimeout";

export type SessionIdleTimeoutPhase = "none" | "warn" | "end";

export type SessionIdleMessageLanguage = "ar" | "en";

export type SessionIdleLocalizedMessages = {
  ar: string;
  en: string;
};

export type SessionIdleTimeoutState = {
  /** last_activity_at ISO string this warning was sent for */
  warningSentForActivityAt?: string | null;
  /** last_activity_at ISO string this end message was sent for */
  endedForActivityAt?: string | null;
  warningSentAt?: string | null;
  endedAt?: string | null;
};

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function readSessionIdleTimeoutState(
  metadata: Record<string, unknown> | null | undefined,
): SessionIdleTimeoutState {
  const raw = metadata?.[SESSION_IDLE_TIMEOUT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  return {
    warningSentForActivityAt:
      typeof record.warningSentForActivityAt === "string" ? record.warningSentForActivityAt : null,
    endedForActivityAt:
      typeof record.endedForActivityAt === "string" ? record.endedForActivityAt : null,
    warningSentAt: typeof record.warningSentAt === "string" ? record.warningSentAt : null,
    endedAt: typeof record.endedAt === "string" ? record.endedAt : null,
  };
}

export function mergeSessionIdleTimeoutMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: SessionIdleTimeoutState,
): Record<string, unknown> {
  const previous = readSessionIdleTimeoutState(existing);
  return {
    ...(existing ?? {}),
    [SESSION_IDLE_TIMEOUT_METADATA_KEY]: {
      ...previous,
      ...patch,
    },
  };
}

/** Warning fires at half the configured timeout (floor of minutes, min 1 minute when T >= 2). */
export function idleWarningThresholdMs(timeoutMinutes: number): number {
  const minutes = Math.max(0, timeoutMinutes);
  if (minutes <= 0) return Number.POSITIVE_INFINITY;
  if (minutes === 1) return 30_000; // half of 1 minute
  return Math.floor(minutes / 2) * 60_000;
}

export function idleEndThresholdMs(timeoutMinutes: number): number {
  const minutes = Math.max(0, timeoutMinutes);
  if (minutes <= 0) return Number.POSITIVE_INFINITY;
  return minutes * 60_000;
}

/** Normalize timestamptz strings so `…+00:00` and `…Z` compare equal. */
export function normalizeActivityTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value.trim();
}

export function sameIdleActivityWindow(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeActivityTimestamp(left);
  const b = normalizeActivityTimestamp(right);
  return Boolean(a && b && a === b);
}

export function resolveSessionIdleTimeoutPhase(input: {
  lastActivityAt: string;
  timeoutMinutes: number;
  now?: Date;
  state?: SessionIdleTimeoutState | null;
}): SessionIdleTimeoutPhase {
  const timeoutMinutes = Math.max(0, Number(input.timeoutMinutes) || 0);
  if (timeoutMinutes <= 0) return "none";

  const lastActivityMs = Date.parse(input.lastActivityAt);
  if (!Number.isFinite(lastActivityMs)) return "none";

  const nowMs = (input.now ?? new Date()).getTime();
  const elapsedMs = nowMs - lastActivityMs;
  if (elapsedMs < 0) return "none";

  const state = input.state ?? {};
  const alreadyEnded = sameIdleActivityWindow(state.endedForActivityAt, input.lastActivityAt);
  const alreadyWarned = sameIdleActivityWindow(state.warningSentForActivityAt, input.lastActivityAt);

  if (elapsedMs >= idleEndThresholdMs(timeoutMinutes)) {
    return alreadyEnded ? "none" : "end";
  }

  if (elapsedMs >= idleWarningThresholdMs(timeoutMinutes)) {
    return alreadyWarned || alreadyEnded ? "none" : "warn";
  }

  return "none";
}

export function normalizeSessionIdleMessageLanguage(
  value: unknown,
): SessionIdleMessageLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "ar" || normalized === "arabic" || normalized.startsWith("ar-")) return "ar";
  if (normalized === "en" || normalized === "english" || normalized.startsWith("en-")) return "en";
  return null;
}

export function detectSessionIdleMessageLanguage(
  text: string | null | undefined,
): SessionIdleMessageLanguage | null {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  return ARABIC_SCRIPT_RE.test(value) ? "ar" : "en";
}

export function readConversationLanguageFromVariables(
  variables: Record<string, unknown> | null | undefined,
): SessionIdleMessageLanguage | null {
  if (!variables) return null;
  const conversation = variables.conversation;
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    return null;
  }
  return normalizeSessionIdleMessageLanguage((conversation as { language?: unknown }).language);
}

/**
 * Prefer session conversation.language, then last customer text, then company fallback.
 */
export function resolveSessionIdleMessageLanguage(input: {
  variables?: Record<string, unknown> | null;
  fallbackLanguage?: string | null;
}): SessionIdleMessageLanguage {
  const fromSession = readConversationLanguageFromVariables(input.variables);
  if (fromSession) return fromSession;

  const conversation =
    input.variables?.conversation &&
    typeof input.variables.conversation === "object" &&
    !Array.isArray(input.variables.conversation)
      ? (input.variables.conversation as Record<string, unknown>)
      : null;
  const lastMessage =
    typeof input.variables?.lastMessage === "string"
      ? input.variables.lastMessage
      : typeof conversation?.last_message === "string"
        ? conversation.last_message
        : null;
  const fromText = detectSessionIdleMessageLanguage(lastMessage);
  if (fromText) return fromText;

  return normalizeSessionIdleMessageLanguage(input.fallbackLanguage) ?? "ar";
}

export function normalizeLocalizedIdleMessages(
  value: unknown,
  legacyFallback?: string | null,
): SessionIdleLocalizedMessages {
  const legacy = typeof legacyFallback === "string" ? legacyFallback.trim() : "";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const ar = typeof record.ar === "string" ? record.ar.trim() : "";
    const en = typeof record.en === "string" ? record.en.trim() : "";
    return {
      ar: ar || legacy,
      en: en || legacy,
    };
  }
  if (typeof value === "string" && value.trim()) {
    return { ar: value.trim(), en: value.trim() };
  }
  return { ar: legacy, en: legacy };
}

export function pickLocalizedIdleMessage(
  messages: SessionIdleLocalizedMessages,
  language: SessionIdleMessageLanguage | null | undefined,
): string {
  if (language === "en") return messages.en.trim() || messages.ar.trim();
  if (language === "ar") return messages.ar.trim() || messages.en.trim();
  return messages.ar.trim() || messages.en.trim();
}
