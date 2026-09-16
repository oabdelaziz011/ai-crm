/**
 * Shared company-scoped Realtime subscription registry.
 * Prevents duplicate channels when multiple hooks mount for the same company.
 */
export type AgentPresenceRealtimePayload = {
  eventType: string;
  new: unknown;
  old: unknown;
};

export type AgentPresenceRealtimeBinder = {
  /** Start listening; return unsubscribe that removes the channel. */
  bind: (
    companyId: string,
    onEvent: (payload: AgentPresenceRealtimePayload) => void,
  ) => () => void;
};

export function createAgentPresenceRealtimeRegistry(binder: AgentPresenceRealtimeBinder) {
  const refCounts = new Map<string, number>();
  const unsubscribers = new Map<string, () => void>();
  const listeners = new Map<string, Set<(payload: AgentPresenceRealtimePayload) => void>>();

  function retain(
    companyId: string,
    onEvent: (payload: AgentPresenceRealtimePayload) => void,
  ): () => void {
    const normalized = companyId.trim();
    if (!normalized) return () => undefined;

    const count = refCounts.get(normalized) ?? 0;
    refCounts.set(normalized, count + 1);

    let set = listeners.get(normalized);
    if (!set) {
      set = new Set();
      listeners.set(normalized, set);
    }
    set.add(onEvent);

    if (count === 0) {
      const unsubscribe = binder.bind(normalized, (payload) => {
        const active = listeners.get(normalized);
        if (!active) return;
        for (const listener of active) listener(payload);
      });
      unsubscribers.set(normalized, unsubscribe);
    }

    return () => {
      const active = listeners.get(normalized);
      active?.delete(onEvent);
      if (active && active.size === 0) listeners.delete(normalized);

      const next = (refCounts.get(normalized) ?? 1) - 1;
      if (next <= 0) {
        refCounts.delete(normalized);
        const unsubscribe = unsubscribers.get(normalized);
        unsubscribers.delete(normalized);
        listeners.delete(normalized);
        unsubscribe?.();
        return;
      }
      refCounts.set(normalized, next);
    };
  }

  return {
    retain,
    refCount: (companyId: string) => refCounts.get(companyId.trim()) ?? 0,
    hasChannel: (companyId: string) => unsubscribers.has(companyId.trim()),
    reset: () => {
      for (const unsubscribe of unsubscribers.values()) unsubscribe();
      refCounts.clear();
      unsubscribers.clear();
      listeners.clear();
    },
  };
}

export type AgentPresenceRealtimeRegistry = ReturnType<typeof createAgentPresenceRealtimeRegistry>;
