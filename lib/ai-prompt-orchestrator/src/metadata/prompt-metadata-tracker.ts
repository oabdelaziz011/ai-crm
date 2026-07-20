import { estimatePromptTokens } from "../rendering/prompt-renderer.js";

export type PromptExecutionMetadata = {
  promptId: string;
  versionId: string;
  versionLabel: string;
  providerKey?: string;
  model?: string;
  renderedSize: number;
  variableCount: number;
  estimatedTokens: number;
  executionTimeMs: number;
  createdAt: string;
};

export class PromptMetadataTracker {
  private readonly records: PromptExecutionMetadata[] = [];

  record(input: Omit<PromptExecutionMetadata, "createdAt" | "estimatedTokens"> & { renderedText: string }) {
    const metadata: PromptExecutionMetadata = {
      promptId: input.promptId,
      versionId: input.versionId,
      versionLabel: input.versionLabel,
      providerKey: input.providerKey,
      model: input.model,
      renderedSize: input.renderedSize,
      variableCount: input.variableCount,
      estimatedTokens: estimatePromptTokens(input.renderedText),
      executionTimeMs: input.executionTimeMs,
      createdAt: new Date().toISOString(),
    };
    this.records.push(metadata);
    return metadata;
  }

  list(): PromptExecutionMetadata[] {
    return [...this.records];
  }

  listByPrompt(promptId: string): PromptExecutionMetadata[] {
    return this.records.filter((record) => record.promptId === promptId);
  }
}
