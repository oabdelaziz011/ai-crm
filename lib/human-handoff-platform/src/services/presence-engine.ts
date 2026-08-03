import { DEFAULT_PRESENCE_HEARTBEAT_MS, DEFAULT_PRESENCE_TIMEOUT_MS } from "../constants.js";
import type { PresenceState } from "../types/handoff-types.js";

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
  return nowMs - Date.parse(lastHeartbeatAt) > timeoutMs;
}

export function nextHeartbeatDeadline(
  nowMs: number = Date.now(),
  intervalMs: number = DEFAULT_PRESENCE_HEARTBEAT_MS,
): string {
  return new Date(nowMs + intervalMs).toISOString();
}

export function isAgentAvailableForAssignment(state: PresenceState): boolean {
  return state === "online";
}
