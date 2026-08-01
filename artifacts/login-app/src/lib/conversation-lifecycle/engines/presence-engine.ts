import type { AgentPresence, PresenceState } from "../types/lifecycle-types.js";

/** In-memory presence store — single source for agent presence (no duplication). */
const presenceByUserId = new Map<string, AgentPresence>();

export function setAgentPresence(
  userId: string,
  state: PresenceState,
  options?: {
    viewingConversationId?: string | null;
    lastSeenAt?: string | null;
  },
): AgentPresence {
  const now = new Date().toISOString();
  const existing = presenceByUserId.get(userId);
  const presence: AgentPresence = {
    userId,
    state,
    viewingConversationId:
      options?.viewingConversationId !== undefined
        ? options.viewingConversationId
        : (existing?.viewingConversationId ?? null),
    lastSeenAt:
      state === "offline" || state === "away"
        ? (options?.lastSeenAt ?? now)
        : (existing?.lastSeenAt ?? null),
    updatedAt: now,
  };
  presenceByUserId.set(userId, presence);
  return presence;
}

export function getAgentPresence(userId: string): AgentPresence | null {
  return presenceByUserId.get(userId) ?? null;
}

export function setAgentTyping(userId: string, conversationId: string | null): AgentPresence {
  return setAgentPresence(userId, "typing", { viewingConversationId: conversationId });
}

export function setAgentViewingConversation(
  userId: string,
  conversationId: string | null,
): AgentPresence {
  return setAgentPresence(userId, "viewing_conversation", {
    viewingConversationId: conversationId,
  });
}

export function setAgentOnline(userId: string): AgentPresence {
  return setAgentPresence(userId, "online");
}

export function setAgentOffline(userId: string): AgentPresence {
  return setAgentPresence(userId, "offline", { lastSeenAt: new Date().toISOString() });
}

export function listAgentsByPresence(states: readonly PresenceState[]): AgentPresence[] {
  return [...presenceByUserId.values()].filter((entry) => states.includes(entry.state));
}

export function listAgentsViewingConversation(conversationId: string): AgentPresence[] {
  return [...presenceByUserId.values()].filter(
    (entry) => entry.viewingConversationId === conversationId,
  );
}

/** Test helper — clears in-memory store. */
export function resetPresenceStore(): void {
  presenceByUserId.clear();
}

export function buildPresenceStateMatrix(): Record<
  PresenceState,
  { description: string; impliesAvailable: boolean }
> {
  return {
    online: { description: "Agent available for assignment", impliesAvailable: true },
    offline: { description: "Agent not connected", impliesAvailable: false },
    busy: { description: "Agent connected but not accepting work", impliesAvailable: false },
    typing: { description: "Agent composing a reply", impliesAvailable: true },
    viewing_conversation: {
      description: "Agent actively viewing a thread",
      impliesAvailable: true,
    },
    away: { description: "Agent idle / away from desk", impliesAvailable: false },
  };
}
