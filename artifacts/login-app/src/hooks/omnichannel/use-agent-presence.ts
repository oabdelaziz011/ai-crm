import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRESENCE_STATES, type PresenceState } from "@workspace/human-handoff-platform";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import {
  buildHandoffServiceContext,
  getLoginAppHandoffPlatformServices,
} from "@/lib/human-handoff-platform/handoff-read-port-adapter";

/** Product-facing subset of canonical PRESENCE_STATES (all are valid backend values). */
export const AGENT_PRESENCE_UI_STATES = ["online", "busy", "away", "offline"] as const satisfies readonly PresenceState[];

export type AgentPresenceUiState = (typeof AGENT_PRESENCE_UI_STATES)[number];

export function agentPresenceQueryKey(companyId: string | null, userId: string | null) {
  return ["handoff-agent-presence", companyId, userId] as const;
}

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

  const query = useQuery({
    queryKey: agentPresenceQueryKey(companyId, userId),
    enabled: Boolean(companyId && userId && canView),
    staleTime: 15_000,
    refetchInterval: 30_000,
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
