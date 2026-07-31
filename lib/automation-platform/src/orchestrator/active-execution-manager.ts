import type { AutomationChannel } from "../constants.js";
import type { AutomationEngine } from "../engine/automation-engine.js";
import type {
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type { AutomationRunRecord, ConversationSessionRecord, ServiceContext } from "../types.js";
import {
  DEFAULT_SESSION_POLICY,
  isOrphanedActiveRun,
  isSessionExpired,
  isTerminalRunStatus,
  type SessionPolicyConfig,
} from "./session-policy.js";

export type ActiveExecution = {
  session: ConversationSessionRecord;
  run: AutomationRunRecord | null;
};

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

export async function listActiveExecutions(
  deps: {
    sessions: ConversationSessionRepository;
    runs: AutomationRunRepository;
  },
  input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
    boundFlowId?: string;
  },
): Promise<ActiveExecution[]> {
  const sessions = await deps.sessions.list({
    companyId: input.companyId,
    channel: input.channel,
    externalUserId: input.externalUserId,
    flowId: input.boundFlowId,
    activeOnly: true,
  });

  const results: ActiveExecution[] = [];
  for (const session of sessions) {
    const run = await loadRunForSession(deps.runs, session);
    if (run && isTerminalRunStatus(run.status)) continue;
    if (
      session.status === "completed" ||
      session.status === "cancelled" ||
      session.status === "expired"
    ) {
      continue;
    }
    results.push({ session, run });
  }

  return results.sort(
    (a, b) =>
      new Date(b.session.last_activity_at).getTime() -
      new Date(a.session.last_activity_at).getTime(),
  );
}

export function countNonTerminalExecutions(executions: ActiveExecution[]): number {
  return executions.filter(({ run, session }) => {
    if (run && isTerminalRunStatus(run.status)) return false;
    return !["completed", "cancelled", "expired"].includes(session.status);
  }).length;
}

export async function cleanupStaleExecutionsForUser(
  engine: AutomationEngine,
  ctx: ServiceContext,
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
    policy?: SessionPolicyConfig;
    preserveRunId?: string | null;
  },
): Promise<string[]> {
  const policy = input.policy ?? DEFAULT_SESSION_POLICY;
  const now = input.now ?? new Date();
  const abandonedRunIds: string[] = [];
  const active = await listActiveExecutions(deps, input);

  for (const { session, run } of active) {
    if (!run || run.id === input.preserveRunId) continue;

    const expired = isSessionExpired(session, now, policy.timeoutMs);
    const orphanRunning =
      run.status === "running" && isOrphanedActiveRun(session, run, now);
    const staleWaiting =
      session.status === "waiting_input" &&
      run.status === "waiting_input" &&
      expired;

    if (!expired && !orphanRunning && !staleWaiting) continue;

    const reason = expired
      ? "session_expired_cleanup"
      : orphanRunning
        ? "orphan_running_cleanup"
        : "stale_waiting_cleanup";

    const result = await engine.abandonActiveRun(ctx, { runId: run.id, reason });
    if (result) abandonedRunIds.push(run.id);
  }

  return abandonedRunIds;
}

export async function abandonAllActiveExecutionsForUser(
  engine: AutomationEngine,
  ctx: ServiceContext,
  deps: {
    sessions: ConversationSessionRepository;
    runs: AutomationRunRepository;
  },
  input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
    boundFlowId: string;
    reason: string;
    exceptRunId?: string | null;
  },
): Promise<string[]> {
  const abandonedRunIds: string[] = [];
  const active = await listActiveExecutions(deps, input);

  for (const { run } of active) {
    if (!run || run.id === input.exceptRunId) continue;
    if (isTerminalRunStatus(run.status)) continue;
    const result = await engine.abandonActiveRun(ctx, {
      runId: run.id,
      reason: input.reason,
    });
    if (result) abandonedRunIds.push(run.id);
  }

  return abandonedRunIds;
}
