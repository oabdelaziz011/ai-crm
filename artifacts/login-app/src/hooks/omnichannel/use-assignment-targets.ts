import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OrganizationRepository } from "@/lib/organization/repositories/organization-repository";
import { OMNICHANNEL_QUEUE_IDS, type OmnichannelQueueId } from "@/lib/omnichannel/services/conversation-queues";

export type AssignmentTargetOption = {
  targetType: "team" | "queue";
  targetId: string;
  targetLabel: string;
};

const ROUTING_QUEUE_IDS: OmnichannelQueueId[] = [
  "unassigned",
  "escalated",
  "waiting_customer",
  "waiting_ai",
];

const QUEUE_LABEL_KEYS: Record<OmnichannelQueueId, string> = {
  unassigned: "omnichannel.queues.unassigned",
  mine: "omnichannel.queues.mine",
  escalated: "omnichannel.queues.escalated",
  waiting_customer: "omnichannel.queues.waitingCustomer",
  waiting_ai: "omnichannel.queues.waitingAi",
  resolved: "omnichannel.queues.resolved",
  closed: "omnichannel.queues.closed",
};

export function queueAssignmentLabelKey(queueId: OmnichannelQueueId): string {
  return QUEUE_LABEL_KEYS[queueId];
}

export function useAssignmentTargets(companyId: string | null) {
  return useQuery({
    queryKey: ["assignment-targets", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<{ teams: AssignmentTargetOption[]; queues: AssignmentTargetOption[] }> => {
      if (!companyId) return { teams: [], queues: [] };

      const repo = new OrganizationRepository(supabase);
      const branchGroups = await repo.listBranchGroups(companyId);

      const teams: AssignmentTargetOption[] = branchGroups.map((group) => ({
        targetType: "team",
        targetId: group.id,
        targetLabel: group.name?.trim() || group.id,
      }));

      const queues: AssignmentTargetOption[] = ROUTING_QUEUE_IDS.filter((id) =>
        OMNICHANNEL_QUEUE_IDS.includes(id),
      ).map((queueId) => ({
        targetType: "queue",
        targetId: queueId,
        targetLabel: queueId,
      }));

      return { teams, queues };
    },
  });
}
