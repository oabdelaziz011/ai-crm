import { useOpportunitiesWorkspace } from "@/components/opportunities/layout/opportunities-workspace-context";
import { OpportunityPipelineBoard } from "@/components/opportunities/opportunity360-workspace";

export function OpportunitiesPipelinePage() {
  const { setSelectedId } = useOpportunitiesWorkspace();

  return <OpportunityPipelineBoard onSelect={setSelectedId} canCreate={false} />;
}
