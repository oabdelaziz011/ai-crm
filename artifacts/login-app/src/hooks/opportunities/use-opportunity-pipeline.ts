import { useMemo } from "react";
import type { OpportunityPipelineBoardModel } from "@workspace/application-layer";
import {
  buildOpportunityStageByIdMap,
  resolveActiveOpportunityPipelineId,
  resolveOpportunityBoardPipelineId,
} from "./opportunity-pipeline-utils";
import { useOpportunityPipelineBoard, useOpportunityPipelines } from "./use-opportunity-commands";

export {
  buildOpportunityStageByIdMap,
  getOpportunityStageAccent,
  getOpportunityStageDisplayName,
  resolveActiveOpportunityPipelineId,
  resolveOpportunityBoardPipelineId,
  resolveOpportunityStageLabel,
} from "./opportunity-pipeline-utils";

export function useActiveOpportunityPipelineId() {
  const pipelinesQuery = useOpportunityPipelines();
  const pipelineId = resolveActiveOpportunityPipelineId(pipelinesQuery.data);

  return {
    pipelineId,
    pipelines: pipelinesQuery.data ?? [],
    isLoading: pipelinesQuery.isLoading,
    isError: pipelinesQuery.isError,
  };
}

/**
 * Loads pipeline board stages from the same query/cache as Opportunities Kanban.
 * Uses the opportunity's pipeline when set; otherwise the active Kanban pipeline.
 */
export function useOpportunityPipelineContext(opportunityPipelineId: string | null | undefined) {
  const active = useActiveOpportunityPipelineId();
  const pipelineId = resolveOpportunityBoardPipelineId(opportunityPipelineId, active.pipelineId);
  const boardQuery = useOpportunityPipelineBoard(pipelineId);

  const stages = useMemo(
    () => boardQuery.data?.stages ?? [],
    [boardQuery.data?.stages],
  );

  const stageById = useMemo(() => buildOpportunityStageByIdMap(stages), [stages]);

  return {
    activePipelineId: active.pipelineId,
    pipelineId,
    board: boardQuery.data as OpportunityPipelineBoardModel | null | undefined,
    stages,
    stageById,
    isLoading: active.isLoading || boardQuery.isLoading,
    isError: active.isError || boardQuery.isError,
  };
}
