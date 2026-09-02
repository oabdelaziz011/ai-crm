import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import {
  buildHandoffServiceContext,
  getLoginAppHandoffPlatformServices,
} from "@/lib/human-handoff-platform/handoff-read-port-adapter";
import {
  deriveHandoffOwnershipView,
  type HandoffOwnershipView,
} from "@/lib/human-handoff-platform/handoff-ownership-view";

export type { HandoffOwnershipView };
export { deriveHandoffOwnershipView };

export function conversationHandoffOwnershipQueryKey(
  companyId: string | null,
  conversationId: string | null,
) {
  return ["handoff-ownership", companyId, conversationId] as const;
}

export function useConversationHandoffOwnership(
  companyId: string | null,
  conversationId: string | null,
) {
  const { user, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const canView = Boolean(
    isSuperAdmin || hasPermission("handoff.view") || hasPermission("conversation.view"),
  );

  const query = useQuery({
    queryKey: conversationHandoffOwnershipQueryKey(companyId, conversationId),
    enabled: Boolean(companyId && conversationId && canView),
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!companyId || !conversationId) return null;
      const platform = getLoginAppHandoffPlatformServices();
      const ctx = buildHandoffServiceContext({
        companyId,
        actorUserId: user?.id ?? null,
        isSuperAdmin,
        hasPermission,
      });
      const result = await platform.queries.getOwnership(ctx, { companyId, conversationId });
      return result.ownership;
    },
  });

  return {
    ...deriveHandoffOwnershipView(query.data ?? null),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    canView,
  };
}
