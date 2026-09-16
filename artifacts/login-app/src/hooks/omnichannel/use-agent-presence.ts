import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_PRESENCE_HEARTBEAT_MS,
  PRESENCE_STATES,
  type PresenceState,
} from "@workspace/human-handoff-platform";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import {
  buildHandoffServiceContext,
  getLoginAppHandoffPlatformServices,
} from "@/lib/human-handoff-platform/handoff-read-port-adapter";
import { createPresenceHeartbeatController } from "./agent-presence-heartbeat";
import {
  AGENT_PRESENCE_REALTIME_RECONCILE_MS,
  agentPresenceQueryKey,
} from "./agent-presence-realtime";
import { useAgentPresenceRealtime } from "./use-agent-presence-realtime";

/** Product-facing subset of canonical PRESENCE_STATES (all are valid backend values). */
export const AGENT_PRESENCE_UI_STATES = ["online", "busy", "away", "offline"] as const satisfies readonly PresenceState[];

export type AgentPresenceUiState = (typeof AGENT_PRESENCE_UI_STATES)[number];

export { agentPresenceQueryKey };

function isPresenceState(value: string): value is PresenceState {
  return (PRESENCE_STATES as readonly string[]).includes(value);
}

export function useAgentPresence(companyId: string | null) {
  const { user, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const canView = Boolean(isSuperAdmin || hasPermission("handoff.view") || hasPermission("handoff.presence"));
  const canUpdate = Boolean(isSuperAdmin || hasPermission("handoff.presence"));

  // Realtime = primary UI sync. Heartbeat remains independent (below).
  useAgentPresenceRealtime(companyId, Boolean(companyId && canView));

  const query = useQuery({
    queryKey: agentPresenceQueryKey(companyId, userId),
    enabled: Boolean(companyId && userId && canView),
    staleTime: 15_000,
    // Fallback reconciliation if a Realtime event is missed (sleep/reconnect).
    refetchInterval: AGENT_PRESENCE_REALTIME_RECONCILE_MS,
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const platform = getLoginAppHandoffPlatformServices();
      const ctx = buildHandoffServiceContext({
        companyId,
        actorUserId: userId,
        isSuperAdmin,
        hasPermission,
      });
      const result = await platform.queries.getAgentPresence(ctx, { companyId, userId });
      return result.presence;
    },
  });

  const mutation = useMutation({
    mutationFn: async (state: PresenceState) => {
      if (!companyId || !userId) throw new Error("Authenticated company user required");
      if (!canUpdate) throw new Error('Permission "handoff.presence" is required');
      if (!isPresenceState(state)) throw new Error("Unsupported presence state");

      const platform = getLoginAppHandoffPlatformServices();
      const ctx = buildHandoffServiceContext({
        companyId,
        actorUserId: userId,
        isSuperAdmin,
        hasPermission,
      });
      return platform.commands.updatePresence(ctx, { companyId, state });
    },
    onSuccess: (result) => {
      if (!companyId || !userId) return;
      queryClient.setQueryData(agentPresenceQueryKey(companyId, userId), result.presence);
    },
  });

  // Clear presence cache when session identity changes.
  useEffect(() => {
    return () => {
      if (companyId && userId) {
        queryClient.removeQueries({ queryKey: agentPresenceQueryKey(companyId, userId) });
      }
    };
  }, [companyId, userId, queryClient]);

  // Lightweight heartbeat while the agent is actively using a visible tab.
  // Hidden tabs pause the interval (no immediate Offline). Stale ONLINE is
  // excluded by server-side freshness. Closing one tab does not force offline
  // if another tab continues heartbeating.
  const heartbeatIdentityRef = useRef({ companyId, userId, isSuperAdmin, canUpdate });
  heartbeatIdentityRef.current = { companyId, userId, isSuperAdmin, canUpdate };

  useEffect(() => {
    if (!companyId || !userId || !canUpdate) return;

    const controller = createPresenceHeartbeatController({
      intervalMs: DEFAULT_PRESENCE_HEARTBEAT_MS,
      isVisible: () =>
        typeof document === "undefined" ? true : document.visibilityState === "visible",
      onHeartbeat: async () => {
        const identity = heartbeatIdentityRef.current;
        if (!identity.companyId || !identity.userId || !identity.canUpdate) return;
        try {
          const platform = getLoginAppHandoffPlatformServices();
          const ctx = buildHandoffServiceContext({
            companyId: identity.companyId,
            actorUserId: identity.userId,
            isSuperAdmin: identity.isSuperAdmin,
            hasPermission,
          });
          const result = await platform.commands.heartbeatPresence(ctx, {
            companyId: identity.companyId,
          });
          queryClient.setQueryData(
            agentPresenceQueryKey(identity.companyId, identity.userId),
            result.presence,
          );
        } catch {
          // Non-fatal: routing freshness will exclude stale ONLINE if beats stop.
        }
      },
    });

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      controller.start();
    }

    const onVisibility = () => controller.onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.stop();
    };
  }, [companyId, userId, canUpdate, isSuperAdmin, hasPermission, queryClient]);

  const setPresence = useCallback(
    async (state: AgentPresenceUiState) => {
      await mutation.mutateAsync(state);
    },
    [mutation],
  );

  const currentState: PresenceState | null = query.data?.state ?? null;

  return useMemo(
    () => ({
      presence: query.data ?? null,
      currentState,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      error: query.error ?? mutation.error ?? null,
      canView,
      canUpdate,
      isUpdating: mutation.isPending,
      setPresence,
      uiStates: AGENT_PRESENCE_UI_STATES,
      refetch: query.refetch,
    }),
    [
      query.data,
      currentState,
      query.isLoading,
      query.isFetching,
      query.error,
      mutation.error,
      mutation.isPending,
      canView,
      canUpdate,
      setPresence,
      query.refetch,
    ],
  );
}
