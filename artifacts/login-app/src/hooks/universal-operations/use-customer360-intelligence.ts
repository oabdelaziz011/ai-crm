import { useMemo } from "react";
import { intelligenceOrchestrator, resolveIntelligenceBlocks, DEFAULT_INTELLIGENCE_BLOCKS } from "@workspace/universal-operations-engine";
import type { Customer360WorkspaceRole } from "@workspace/universal-operations-engine";
import type { OperationsCustomer360WorkspaceData } from "@workspace/universal-operations-engine";

export function useCustomer360Intelligence(
  data: OperationsCustomer360WorkspaceData | undefined,
  templateKey: string,
  role: Customer360WorkspaceRole,
) {
  return useMemo(() => {
    if (!data) return { snapshot: null, blocks: [] };
    return {
      snapshot: intelligenceOrchestrator.buildSnapshot(templateKey, data),
      blocks: resolveIntelligenceBlocks(DEFAULT_INTELLIGENCE_BLOCKS, role),
    };
  }, [data, templateKey, role]);
}
