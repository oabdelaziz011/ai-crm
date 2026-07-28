export type BuilderRenderPerfCounters = {
  validationRuns: number;
  structuralValidationRuns: number;
  configValidationRuns: number;
  /** @deprecated use structuralProjectionRuns */
  projectionRuns: number;
  /** @deprecated use presentationPatches */
  presentationPatchRuns: number;
  /** @deprecated use canvasSeeds */
  canvasSeedCommits: number;
  structuralProjectionRuns: number;
  presentationPatches: number;
  validationPatches: number;
  edgePresentationPatches: number;
  edgeValidationPatches: number;
  canvasSeeds: number;
  edgeSeeds: number;
};

export const builderRenderPerf: BuilderRenderPerfCounters = {
  validationRuns: 0,
  structuralValidationRuns: 0,
  configValidationRuns: 0,
  projectionRuns: 0,
  presentationPatchRuns: 0,
  canvasSeedCommits: 0,
  structuralProjectionRuns: 0,
  presentationPatches: 0,
  validationPatches: 0,
  edgePresentationPatches: 0,
  edgeValidationPatches: 0,
  canvasSeeds: 0,
  edgeSeeds: 0,
};

export function resetBuilderRenderPerf(): void {
  builderRenderPerf.validationRuns = 0;
  builderRenderPerf.structuralValidationRuns = 0;
  builderRenderPerf.configValidationRuns = 0;
  builderRenderPerf.projectionRuns = 0;
  builderRenderPerf.presentationPatchRuns = 0;
  builderRenderPerf.canvasSeedCommits = 0;
  builderRenderPerf.structuralProjectionRuns = 0;
  builderRenderPerf.presentationPatches = 0;
  builderRenderPerf.validationPatches = 0;
  builderRenderPerf.edgePresentationPatches = 0;
  builderRenderPerf.edgeValidationPatches = 0;
  builderRenderPerf.canvasSeeds = 0;
  builderRenderPerf.edgeSeeds = 0;
}
