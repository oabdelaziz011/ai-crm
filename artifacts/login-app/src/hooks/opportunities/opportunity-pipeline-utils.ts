import type {
  OpportunityPipelineReadModel,
  OpportunityStageReadModel,
} from "@workspace/application-layer";

/** Same active pipeline resolution as Opportunities Kanban board. */
export function resolveActiveOpportunityPipelineId(
  pipelines: readonly OpportunityPipelineReadModel[] | undefined,
): string | null {
  if (!pipelines?.length) return null;
  return pipelines.find((pipeline) => pipeline.isDefault)?.id ?? pipelines[0]?.id ?? null;
}

/** Display label comes from pipeline stage record (DB name) — never hardcoded catalogs. */
export function getOpportunityStageDisplayName(
  stage: Pick<OpportunityStageReadModel, "name"> | null | undefined,
): string {
  return stage?.name?.trim() ?? "";
}

export function buildOpportunityStageByIdMap(
  stages: readonly OpportunityStageReadModel[],
): Map<string, OpportunityStageReadModel> {
  return new Map(stages.map((stage) => [stage.id, stage]));
}

/** Optional stage accent from pipeline metadata (e.g. color set in pipeline management). */
export function getOpportunityStageAccent(
  stage: OpportunityStageReadModel & { metadata?: Record<string, unknown> },
): string | null {
  const raw = stage.metadata?.color ?? stage.metadata?.accentColor ?? stage.metadata?.accent;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function resolveOpportunityBoardPipelineId(
  opportunityPipelineId: string | null | undefined,
  activePipelineId: string | null,
): string | null {
  return opportunityPipelineId ?? activePipelineId;
}

export function resolveOpportunityStageLabel(
  stageById: ReadonlyMap<string, OpportunityStageReadModel>,
  stageId: string | null | undefined,
  fallbackName: string | null | undefined,
): string {
  if (stageId) {
    const fromPipeline = getOpportunityStageDisplayName(stageById.get(stageId));
    if (fromPipeline) return fromPipeline;
  }
  return fallbackName?.trim() ?? "";
}
