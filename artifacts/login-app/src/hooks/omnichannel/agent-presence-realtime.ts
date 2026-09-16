import { PRESENCE_STATES, type AgentPresenceRecord, type PresenceState } from "@workspace/human-handoff-platform";

/** Channel name: omnichannel-agent-presence:{companyId} */
export function agentPresenceRealtimeChannelName(companyId: string): string {
  return `omnichannel-agent-presence:${companyId}`;
}

/** Query key for a single agent's presence (matches useAgentPresence). */
export function agentPresenceQueryKey(companyId: string | null, userId: string | null) {
  return ["handoff-agent-presence", companyId, userId] as const;
}

/** Assignment targets query that embeds online member counts from presence. */
export function assignmentTargetsQueryKey(companyId: string | null) {
  return ["assignment-targets", "handoff-queues", companyId] as const;
}

/**
 * Reconciliation polling interval while Realtime is primary.
 * Keeps a lightweight resync path for missed events / reconnect gaps.
 */
export const AGENT_PRESENCE_REALTIME_RECONCILE_MS = 90_000;

export type AgentPresenceRealtimeEventType = "INSERT" | "UPDATE" | "DELETE" | string;

export type AgentPresenceCachePatch =
  | {
      type: "set";
      companyId: string;
      userId: string;
      presence: AgentPresenceRecord;
      stateChanged: boolean;
    }
  | {
      type: "clear";
      companyId: string;
      userId: string;
      stateChanged: boolean;
    }
  | {
      type: "ignore";
      reason: string;
    };

function isPresenceState(value: unknown): value is PresenceState {
  return typeof value === "string" && (PRESENCE_STATES as readonly string[]).includes(value);
}

/** Map a postgres_changes row (snake_case) into the UI presence record shape. */
export function mapAgentPresenceRealtimeRow(row: unknown): AgentPresenceRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const companyId = typeof r.company_id === "string" ? r.company_id.trim() : "";
  const userId = typeof r.user_id === "string" ? r.user_id.trim() : "";
  if (!companyId || !userId) return null;
  if (!isPresenceState(r.state)) return null;

  return {
    id: typeof r.id === "string" && r.id.trim() ? r.id : `${companyId}:${userId}`,
    companyId,
    userId,
    state: r.state,
    viewingConversationId:
      typeof r.viewing_conversation_id === "string" && r.viewing_conversation_id.trim()
        ? r.viewing_conversation_id
        : null,
    lastHeartbeatAt:
      typeof r.last_heartbeat_at === "string" && r.last_heartbeat_at.trim()
        ? r.last_heartbeat_at
        : null,
    lastSeenAt:
      typeof r.last_seen_at === "string" && r.last_seen_at.trim() ? r.last_seen_at : null,
    // Keep metadata opaque; UI does not render it. Cap to plain object only.
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
    updatedAt:
      typeof r.updated_at === "string" && r.updated_at.trim()
        ? r.updated_at
        : new Date().toISOString(),
  };
}

/**
 * Plan a cache patch from a Realtime postgres_changes payload.
 * Strict company isolation: foreign-company rows are ignored.
 * Read-only: never schedules heartbeat/assignment/reply writes.
 */
export function planAgentPresenceRealtimePatch(input: {
  currentCompanyId: string;
  eventType: AgentPresenceRealtimeEventType;
  newRow: unknown;
  oldRow: unknown;
}): AgentPresenceCachePatch {
  const currentCompanyId = input.currentCompanyId?.trim();
  if (!currentCompanyId) {
    return { type: "ignore", reason: "missing_current_company" };
  }

  const eventType = String(input.eventType ?? "").toUpperCase();
  const next = mapAgentPresenceRealtimeRow(input.newRow);
  const prev = mapAgentPresenceRealtimeRow(input.oldRow);

  if (eventType === "DELETE") {
    const row = prev ?? next;
    if (!row) return { type: "ignore", reason: "malformed_delete" };
    if (row.companyId !== currentCompanyId) {
      return { type: "ignore", reason: "cross_company" };
    }
    return {
      type: "clear",
      companyId: row.companyId,
      userId: row.userId,
      stateChanged: true,
    };
  }

  if (eventType === "INSERT" || eventType === "UPDATE" || eventType === "*") {
    if (!next) return { type: "ignore", reason: "malformed_row" };
    if (next.companyId !== currentCompanyId) {
      return { type: "ignore", reason: "cross_company" };
    }
    const stateChanged = !prev || prev.state !== next.state || prev.companyId !== next.companyId;
    return {
      type: "set",
      companyId: next.companyId,
      userId: next.userId,
      presence: next,
      stateChanged: eventType === "INSERT" ? true : stateChanged,
    };
  }

  // Unknown event types: try to apply new row if company matches, else ignore.
  if (next) {
    if (next.companyId !== currentCompanyId) {
      return { type: "ignore", reason: "cross_company" };
    }
    return {
      type: "set",
      companyId: next.companyId,
      userId: next.userId,
      presence: next,
      stateChanged: !prev || prev.state !== next.state,
    };
  }

  return { type: "ignore", reason: "unsupported_event" };
}

/** True when assignment-target online counts may need a refresh. */
export function shouldInvalidateAssignmentTargets(patch: AgentPresenceCachePatch): boolean {
  return patch.type !== "ignore" && patch.stateChanged;
}
