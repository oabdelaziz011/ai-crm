import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  agentPresenceQueryKey,
  agentPresenceRealtimeChannelName,
  assignmentTargetsQueryKey,
  planAgentPresenceRealtimePatch,
  shouldInvalidateAssignmentTargets,
  type AgentPresenceCachePatch,
} from "./agent-presence-realtime";
import {
  createAgentPresenceRealtimeRegistry,
  type AgentPresenceRealtimeRegistry,
} from "./agent-presence-realtime-registry";

export function applyAgentPresenceCachePatch(
  queryClient: QueryClient,
  patch: AgentPresenceCachePatch,
): void {
  if (patch.type === "ignore") return;

  if (patch.type === "set") {
    const key = agentPresenceQueryKey(patch.companyId, patch.userId);
    const existing = queryClient.getQueryData(key) as Record<string, unknown> | null | undefined;
    if (
      existing
      && typeof existing === "object"
      && existing.state === patch.presence.state
      && existing.userId === patch.presence.userId
      && existing.companyId === patch.presence.companyId
    ) {
      // Merge timestamps without replacing the whole object identity unnecessarily.
      queryClient.setQueryData(key, {
        ...existing,
        ...patch.presence,
      });
    } else {
      queryClient.setQueryData(key, patch.presence);
    }
  } else if (patch.type === "clear") {
    queryClient.setQueryData(agentPresenceQueryKey(patch.companyId, patch.userId), null);
  }

  if (shouldInvalidateAssignmentTargets(patch)) {
    const key = assignmentTargetsQueryKey(patch.companyId);
    const cached = queryClient.getQueryCache().find({ queryKey: [...key] });
    if (cached && cached.getObserversCount() > 0) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
  }
}

function createSupabasePresenceRegistry(): AgentPresenceRealtimeRegistry {
  return createAgentPresenceRealtimeRegistry({
    bind: (companyId, onEvent) => {
      const channel = supabase
        .channel(agentPresenceRealtimeChannelName(companyId))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "agent_presence",
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            onEvent({
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            });
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  });
}

/** One shared registry for the app QueryClient. */
let sharedRegistry: AgentPresenceRealtimeRegistry | null = null;

function getSharedRegistry(): AgentPresenceRealtimeRegistry {
  if (!sharedRegistry) {
    sharedRegistry = createSupabasePresenceRegistry();
  }
  return sharedRegistry;
}

function handlePresenceEvent(queryClient: QueryClient, companyId: string, payload: {
  eventType: string;
  new: unknown;
  old: unknown;
}) {
  try {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: companyId,
      eventType: payload.eventType,
      newRow: payload.new,
      oldRow: payload.old,
    });
    applyAgentPresenceCachePatch(queryClient, patch);
  } catch {
    // Malformed / unexpected payloads must never break Omnichannel.
  }
}

/** Test helpers */
export function __resetAgentPresenceRealtimeForTests(): void {
  sharedRegistry?.reset();
  sharedRegistry = null;
}

/**
 * Company-scoped Realtime for `public.agent_presence`.
 * UI sync only — does not write presence, assign, or gate replies.
 */
export function useAgentPresenceRealtime(companyId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId || !enabled) return;
    const registry = getSharedRegistry();
    return registry.retain(companyId, (payload) => {
      handlePresenceEvent(queryClient, companyId, payload);
    });
  }, [companyId, enabled, queryClient]);
}
