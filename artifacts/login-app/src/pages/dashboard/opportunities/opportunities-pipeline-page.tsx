import { useOpportunitiesWorkspace } from "@/components/opportunities/layout/opportunities-workspace-context";
import { OpportunityPipelineBoard } from "@/components/opportunities/opportunity360-workspace";
import { useAuthUser } from "@/hooks/use-rbac";

export function OpportunitiesPipelinePage() {
  const { setSelectedId, setCreateOpen } = useOpportunitiesWorkspace();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("opportunities.create");

  return (
    <OpportunityPipelineBoard
      onSelect={setSelectedId}
      canCreate={canCreate}
      onCreate={() => setCreateOpen(true)}
    />
  );
}
