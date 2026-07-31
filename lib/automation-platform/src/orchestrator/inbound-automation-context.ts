import type { AutomationChannel } from "../constants.js";
import { DEFAULT_SESSION_TIMEOUT_MS } from "../constants.js";
import type {
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";
import { isSessionExpired } from "./session-policy.js";

export type InboundAutomationContext = {
  session: ConversationSessionRecord | null;
  run: AutomationRunRecord | null;
  expired: boolean;
  lookup: {
    strategy: "waiting_input_session" | "active_session" | "run_fallback" | "none";
    skippedExpiredSessionIds: string[];
  };
};

export function sessionActivityCutoffIso(
  now: Date = new Date(),
  timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS,
): string {
  return new Date(now.getTime() - timeoutMs).toISOString();
}

async function loadRunForSession(
  runs: AutomationRunRepository,
  session: ConversationSessionRecord,
): Promise<AutomationRunRecord | null> {
  if (session.run_id) {
    const byId = await runs.findById(session.run_id);
    if (byId) return byId;
  }
  return runs.findBySessionId(session.id);
}

export async function resolveInboundAutomationContext(
  deps: {
    sessions: ConversationSessionRepository;
    runs: AutomationRunRepository;
  },
  input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
    boundFlowId: string;
    now?: Date;
  },
): Promise<InboundAutomationContext> {
  const now = input.now ?? new Date();
  const cutoffIso = sessionActivityCutoffIso(now);
  const skippedExpiredSessionIds: string[] = [];

  const waitingSession = await deps.sessions.findActiveSession({
    companyId: input.companyId,
    channel: input.channel,
    externalUserId: input.externalUserId,
    preferStatus: "waiting_input",
    activitySince: cutoffIso,
  });

  if (waitingSession) {
    const run = await loadRunForSession(deps.runs, waitingSession);
    return {
      session: waitingSession,
      run,
      expired: false,
      lookup: { strategy: "waiting_input_session", skippedExpiredSessionIds },
    };
  }

  const activeSession = await deps.sessions.findActiveSession({
    companyId: input.companyId,
    channel: input.channel,
    externalUserId: input.externalUserId,
    activitySince: cutoffIso,
  });

  if (activeSession) {
    const run = await loadRunForSession(deps.runs, activeSession);
    return {
      session: activeSession,
      run,
      expired: false,
      lookup: { strategy: "active_session", skippedExpiredSessionIds },
    };
  }

  if (deps.runs.findLatestResumableForExternalUser) {
    const fallback = await deps.runs.findLatestResumableForExternalUser({
      companyId: input.companyId,
      channel: input.channel,
      externalUserId: input.externalUserId,
      boundFlowId: input.boundFlowId,
      activitySince: cutoffIso,
    });
    if (fallback) {
      return {
        session: fallback.session,
        run: fallback.run,
        expired: false,
        lookup: { strategy: "run_fallback", skippedExpiredSessionIds },
      };
    }
  }

  const staleSession = await deps.sessions.findActiveSession({
    companyId: input.companyId,
    channel: input.channel,
    externalUserId: input.externalUserId,
  });

  if (staleSession) {
    skippedExpiredSessionIds.push(staleSession.id);
    const run = await loadRunForSession(deps.runs, staleSession);
    return {
      session: staleSession,
      run,
      expired: isSessionExpired(staleSession, now),
      lookup: { strategy: "active_session", skippedExpiredSessionIds },
    };
  }

  return {
    session: null,
    run: null,
    expired: false,
    lookup: { strategy: "none", skippedExpiredSessionIds },
  };
}
