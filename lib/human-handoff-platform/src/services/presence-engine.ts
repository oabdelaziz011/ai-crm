import { DEFAULT_PRESENCE_HEARTBEAT_MS, DEFAULT_PRESENCE_TIMEOUT_MS } from "../constants.js";
import type { AgentPresenceRecord, PresenceState } from "../types/handoff-types.js";

/**
 * Centralized agent presence heartbeat freshness policy.
 *
 * Defaults (web app, conservative):
 * - Heartbeat interval: 30s (`DEFAULT_PRESENCE_HEARTBEAT_MS`)
 * - Stale threshold: 120s (`DEFAULT_PRESENCE_TIMEOUT_MS`) — ~4 missed heartbeats
 *
 * Clock handling: compare `last_heartbeat_at` to server `Date.now()` / routing `nowMs`.
 * Missing/invalid timestamps are treated as stale.
 *
 * Auto-downgrade scope: only STALE ONLINE is treated as unavailable for auto-routing.
 * Busy / away / break / dnd are never auto-converted by freshness; they remain
 * ineligible for auto-routing by state alone.
 *
 * Primary safety rule: STALE ONLINE ≠ AVAILABLE.
 */
export const PRESENCE_FRESHNESS_POLICY = {
  heartbeatIntervalMs: DEFAULT_PRESENCE_HEARTBEAT_MS,
  staleThresholdMs: DEFAULT_PRESENCE_TIMEOUT_MS,
  autoNormalizeStates: ["online"] as const satisfies readonly PresenceState[],
} as const;

export type PresenceFreshnessOptions = {
  nowMs?: number;
  timeoutMs?: number;
};

export function resolvePresenceAfterHeartbeat(
  currentState: PresenceState,
  requestedState: PresenceState,
): PresenceState {
  if (requestedState === "dnd" || requestedState === "break") return requestedState;
  if (currentState === "dnd" || currentState === "break") return currentState;
  return requestedState;
}

export function shouldExpirePresence(
  lastHeartbeatAt: string | null,
  nowMs: number = Date.now(),
  timeoutMs: number = DEFAULT_PRESENCE_TIMEOUT_MS,
): boolean {
  if (!lastHeartbeatAt) return true;
  const parsed = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(parsed)) return true;
  return nowMs - parsed > timeoutMs;
}

export function isPresenceHeartbeatFresh(
  lastHeartbeatAt: string | null,
  options: PresenceFreshnessOptions = {},
): boolean {
  return !shouldExpirePresence(
    lastHeartbeatAt,
    options.nowMs ?? Date.now(),
    options.timeoutMs ?? DEFAULT_PRESENCE_TIMEOUT_MS,
  );
}

export function nextHeartbeatDeadline(
  nowMs: number = Date.now(),
  intervalMs: number = DEFAULT_PRESENCE_HEARTBEAT_MS,
): string {
  return new Date(nowMs + intervalMs).toISOString();
}

/** State-only check: ONLINE is the only auto-routing state. */
export function isAgentAvailableForAssignment(state: PresenceState): boolean {
  return state === "online";
}

/**
 * Effective auto-routing eligibility:
 * ONLINE + fresh heartbeat → available
 * ONLINE + stale heartbeat → unavailable
 * Any other state → unavailable
 */
export function isAgentEffectivelyAvailableForAssignment(
  presence:
    | Pick<AgentPresenceRecord, "state" | "lastHeartbeatAt">
    | null
    | undefined,
  options: PresenceFreshnessOptions = {},
): boolean {
  if (!presence) return false;
  if (!isAgentAvailableForAssignment(presence.state)) return false;
  return isPresenceHeartbeatFresh(presence.lastHeartbeatAt, options);
}

export function heartbeatAgeMs(
  lastHeartbeatAt: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (!lastHeartbeatAt) return null;
  const parsed = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}
