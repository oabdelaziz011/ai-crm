import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeSessionIdleTimeoutMetadata,
  normalizeActivityTimestamp,
  normalizeLocalizedIdleMessages,
  readSessionIdleTimeoutState,
  resolveSessionIdleMessageLanguage,
  resolveSessionIdleTimeoutPhase,
  type SessionIdleLocalizedMessages,
  type SessionIdleTimeoutPhase,
} from "./session-idle-timeout-policy.js";

const ACTIVE_SESSION_STATUSES = ["active", "running", "waiting_input", "paused"] as const;

export type SessionIdleTimeoutCandidate = {
  sessionId: string;
  companyId: string;
  channel: string;
  externalUserId: string;
  lastActivityAt: string;
  metadata: Record<string, unknown>;
  variables: Record<string, unknown>;
  runId: string | null;
  timeoutMinutes: number;
  warningMessages: SessionIdleLocalizedMessages;
  endedMessages: SessionIdleLocalizedMessages;
  fallbackLanguage: string | null;
};

export type SessionIdleOutboundTarget = {
  companyChannelId: string;
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
};

export type SessionIdleTimeoutProcessorDeps = {
  client: SupabaseClient;
  now?: () => Date;
  limit?: number;
  sendWhatsAppText: (input: {
    companyId: string;
    companyChannelId: string;
    conversationId: string;
    channelSessionId: string;
    externalThreadId: string;
    text: string;
    kind: "warn" | "end";
    sessionId: string;
    language: string;
  }) => Promise<void>;
  onProcessed?: (detail: {
    sessionId: string;
    companyId: string;
    phase: SessionIdleTimeoutPhase;
    language: string;
  }) => void;
  onError?: (detail: {
    sessionId: string;
    companyId: string;
    phase: SessionIdleTimeoutPhase;
    err: unknown;
  }) => void;
};

export type SessionIdleTimeoutTickResult = {
  scanned: number;
  warned: number;
  ended: number;
  skipped: number;
  errors: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function listSessionIdleTimeoutCandidates(
  client: SupabaseClient,
  limit = 100,
): Promise<SessionIdleTimeoutCandidate[]> {
  const { data: settingsRows, error: settingsError } = await client
    .from("ai_assistant_settings")
    .select(
      "company_id, language, conversation_timeout_minutes, session_idle_warning_message, session_ended_message, session_idle_warning_messages, session_ended_messages",
    )
    .is("deleted_at", null)
    .gt("conversation_timeout_minutes", 0);

  if (settingsError) throw settingsError;
  if (!settingsRows?.length) return [];

  const settingsByCompany = new Map(
    settingsRows.map((row) => [
      row.company_id as string,
      {
        timeoutMinutes: Number(row.conversation_timeout_minutes) || 0,
        fallbackLanguage: typeof row.language === "string" ? row.language : null,
        warningMessages: normalizeLocalizedIdleMessages(
          row.session_idle_warning_messages,
          typeof row.session_idle_warning_message === "string"
            ? row.session_idle_warning_message
            : null,
        ),
        endedMessages: normalizeLocalizedIdleMessages(
          row.session_ended_messages,
          typeof row.session_ended_message === "string" ? row.session_ended_message : null,
        ),
      },
    ]),
  );

  const companyIds = [...settingsByCompany.keys()];
  const { data: sessions, error: sessionsError } = await client
    .from("conversation_sessions")
    .select(
      "id, company_id, channel, external_user_id, last_activity_at, metadata, variables, run_id, status",
    )
    .eq("channel", "whatsapp")
    .in("company_id", companyIds)
    .in("status", [...ACTIVE_SESSION_STATUSES])
    .not("external_user_id", "is", null)
    .order("last_activity_at", { ascending: true })
    .limit(limit);

  if (sessionsError) throw sessionsError;

  const candidates: SessionIdleTimeoutCandidate[] = [];
  // Keep only the newest open session per WhatsApp contact to avoid spamming
  // end/warning messages for abandoned historical sessions.
  const latestByContact = new Map<string, (typeof sessions)[number]>();
  for (const row of sessions ?? []) {
    const companyId = String(row.company_id ?? "");
    const externalUserId = typeof row.external_user_id === "string" ? row.external_user_id.trim() : "";
    if (!companyId || !externalUserId) continue;
    const key = `${companyId}:${externalUserId}`;
    const existing = latestByContact.get(key);
    if (!existing) {
      latestByContact.set(key, row);
      continue;
    }
    const existingMs = Date.parse(String(existing.last_activity_at ?? ""));
    const rowMs = Date.parse(String(row.last_activity_at ?? ""));
    if (Number.isFinite(rowMs) && (!Number.isFinite(existingMs) || rowMs >= existingMs)) {
      latestByContact.set(key, row);
    }
  }

  for (const row of latestByContact.values()) {
    const companyId = String(row.company_id ?? "");
    const settings = settingsByCompany.get(companyId);
    const externalUserId = typeof row.external_user_id === "string" ? row.external_user_id.trim() : "";
    const lastActivityAt =
      typeof row.last_activity_at === "string" ? row.last_activity_at : "";
    if (!settings || !externalUserId || !lastActivityAt) continue;

    candidates.push({
      sessionId: String(row.id),
      companyId,
      channel: String(row.channel),
      externalUserId,
      lastActivityAt,
      metadata: asRecord(row.metadata),
      variables: asRecord(row.variables),
      runId: typeof row.run_id === "string" ? row.run_id : null,
      timeoutMinutes: settings.timeoutMinutes,
      warningMessages: settings.warningMessages,
      endedMessages: settings.endedMessages,
      fallbackLanguage: settings.fallbackLanguage,
    });
  }

  return candidates;
}

export async function resolveWhatsAppOutboundTarget(
  client: SupabaseClient,
  input: { companyId: string; externalUserId: string },
): Promise<SessionIdleOutboundTarget | null> {
  const { data: channelRows, error: channelError } = await client
    .from("company_channels")
    .select("id, is_default, is_enabled, deleted_at, communication_channel:communication_channels(key)")
    .eq("company_id", input.companyId)
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .limit(20);

  if (channelError) throw channelError;
  const companyChannelId = (channelRows ?? []).find((row) => {
    const linked = row.communication_channel as { key?: string } | { key?: string }[] | null;
    const key = Array.isArray(linked) ? linked[0]?.key : linked?.key;
    return key === "whatsapp";
  })?.id as string | undefined;
  if (!companyChannelId) return null;

  const { data: channelSession, error: sessionError } = await client
    .from("channel_sessions")
    .select("id, conversation_id, external_thread_id, session_status")
    .eq("company_id", input.companyId)
    .eq("company_channel_id", companyChannelId)
    .eq("external_thread_id", input.externalUserId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!channelSession?.conversation_id || !channelSession?.id) return null;

  return {
    companyChannelId,
    conversationId: String(channelSession.conversation_id),
    channelSessionId: String(channelSession.id),
    externalThreadId: String(channelSession.external_thread_id ?? input.externalUserId),
  };
}

async function expireAutomationSession(
  client: SupabaseClient,
  candidate: SessionIdleTimeoutCandidate,
  nowIso: string,
): Promise<void> {
  const activityKey =
    normalizeActivityTimestamp(candidate.lastActivityAt) ?? candidate.lastActivityAt;
  const metadata = mergeSessionIdleTimeoutMetadata(candidate.metadata, {
    endedForActivityAt: activityKey,
    endedAt: nowIso,
  });

  const { error: sessionError } = await client
    .from("conversation_sessions")
    .update({
      status: "expired",
      metadata: {
        ...metadata,
        expiredAt: nowIso,
        expiredReason: "session_idle_timeout",
      },
      // Do not bump last_activity_at — idle clock must stay on last customer message.
      last_activity_at: candidate.lastActivityAt,
    })
    .eq("id", candidate.sessionId);

  if (sessionError) throw sessionError;

  if (candidate.runId) {
    await client
      .from("automation_runs")
      .update({
        status: "cancelled",
        error_message: "Session idle timeout",
        finished_at: nowIso,
      })
      .eq("id", candidate.runId)
      .in("status", ["pending", "queued", "running", "waiting_input"]);
  }
}

/**
 * Scans WhatsApp automation sessions for idle expiry.
 *
 * Product rule: do NOT send proactive idle WhatsApp texts (warning / session-ended).
 * Expire the automation session silently at full timeout so the next customer
 * inbound can start a fresh engagement and send the configured welcome only then.
 */
export async function processSessionIdleTimeouts(
  deps: SessionIdleTimeoutProcessorDeps,
): Promise<SessionIdleTimeoutTickResult> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const candidates = await listSessionIdleTimeoutCandidates(deps.client, deps.limit ?? 100);

  const result: SessionIdleTimeoutTickResult = {
    scanned: candidates.length,
    warned: 0,
    ended: 0,
    skipped: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    const phase = resolveSessionIdleTimeoutPhase({
      lastActivityAt: candidate.lastActivityAt,
      timeoutMinutes: candidate.timeoutMinutes,
      now,
      state: readSessionIdleTimeoutState(candidate.metadata),
    });

    if (phase === "none") {
      result.skipped += 1;
      continue;
    }

    // Half-time warning messages are cancelled — wait for full timeout to expire.
    if (phase === "warn") {
      result.skipped += 1;
      continue;
    }

    const language = resolveSessionIdleMessageLanguage({
      variables: candidate.variables,
      fallbackLanguage: candidate.fallbackLanguage,
    });

    try {
      // Silent expire only — no "session ended" WhatsApp spam.
      await expireAutomationSession(deps.client, candidate, nowIso);
      result.ended += 1;

      deps.onProcessed?.({
        sessionId: candidate.sessionId,
        companyId: candidate.companyId,
        phase,
        language,
      });
    } catch (err) {
      result.errors += 1;
      deps.onError?.({
        sessionId: candidate.sessionId,
        companyId: candidate.companyId,
        phase,
        err,
      });
    }
  }

  return result;
}
