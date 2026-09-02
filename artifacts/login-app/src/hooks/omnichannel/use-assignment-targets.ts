import { useQuery } from "@tanstack/react-query";
import type { HandoffQueueRecord, PresenceState } from "@workspace/human-handoff-platform";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import {
  buildHandoffServiceContext,
  getLoginAppHandoffPlatformServices,
} from "@/lib/human-handoff-platform/handoff-read-port-adapter";

export type AssignmentTargetOption = {
  targetType: "team" | "queue";
  targetId: string;
  targetLabel: string;
  routingStrategy?: string;
  memberCount?: number;
  onlineMemberCount?: number;
  totalActiveConversations?: number;
};

export type HandoffQueueAssignmentOption = AssignmentTargetOption & {
  targetType: "queue";
  queue: HandoffQueueRecord;
};

/**
 * Assignment targets for Human Handoff.
 * Queues come from canonical `handoff_queues` (UUID), never soft inbox filters.
 */
export function useAssignmentTargets(companyId: string | null) {
  const { user, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  return useQuery({
    queryKey: ["assignment-targets", "handoff-queues", companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async (): Promise<{
      teams: AssignmentTargetOption[];
      queues: HandoffQueueAssignmentOption[];
    }> => {
      if (!companyId) return { teams: [], queues: [] };

      const canList =
        isSuperAdmin ||
        hasPermission("handoff.view") ||
        hasPermission("handoff.assign") ||
        hasPermission("handoff.queue");
      if (!canList) return { teams: [], queues: [] };

      const platform = getLoginAppHandoffPlatformServices();
      const ctx = buildHandoffServiceContext({
        companyId,
        actorUserId: user?.id ?? null,
        isSuperAdmin,
        hasPermission,
      });

      const [{ queues }, presence] = await Promise.all([
        platform.queries.listQueues(ctx, { companyId, activeOnly: true }),
        platform.queries.listAgentPresence(ctx, {
          companyId,
          states: ["online"] as PresenceState[],
        }),
      ]);
      const onlineIds = new Set(presence.agents.map((row) => row.userId));

      const enriched: HandoffQueueAssignmentOption[] = [];
      for (const queue of queues) {
        const { members } = await platform.queries.listQueueMembers(ctx, {
          companyId,
          queueId: queue.id,
        });
        const activeMembers = members.filter((member) => member.isActive);
        enriched.push({
          targetType: "queue",
          targetId: queue.id,
          targetLabel: queue.name?.trim() || queue.slug || queue.id,
          routingStrategy: queue.routingStrategy,
          memberCount: activeMembers.length,
          onlineMemberCount: activeMembers.filter((member) => onlineIds.has(member.userId)).length,
          totalActiveConversations: activeMembers.reduce(
            (sum, member) => sum + (member.activeConversationCount || 0),
            0,
          ),
          queue,
        });
      }

      return { teams: [], queues: enriched };
    },
  });
}

/** Soft inbox filter i18n keys — not used for handoff_queues assignment targets. */
export function queueAssignmentLabelKey(queueId: string): string {
  return `omnichannel.queues.${queueId}`;
}
