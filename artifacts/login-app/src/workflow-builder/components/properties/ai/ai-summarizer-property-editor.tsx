import { useMemo } from "react";
import {
  AI_SUMMARIZER_NODE_KEY,
  createDefaultSummarizerNodeConfig,
  normalizeAIWorkflowNodeConfig,
} from "@workspace/ai-workflow-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { AIWorkflowConfigPanel } from "./ai-workflow-config-panel";
import { AISummaryOptionsEditor } from "./ai-summary-options-editor";
import { AISummarizerPreviewPanel } from "./ai-summarizer-preview-panel";
import { AIWorkflowValidationPanel } from "./ai-validation-panel";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";

export function AISummarizerPropertyEditor({ config, onChange }: NodePropertyEditorProps) {
  const { services } = useAIWorkflowPlatformServices();
  const aiConfig = useMemo(
    () => readAIWorkflowConfig(config, AI_SUMMARIZER_NODE_KEY),
    [config],
  );

  const preview = useMemo(
    () => services.preview.preview({ config: aiConfig, workflowVariables: {} }),
    [aiConfig, services.preview],
  );

  const validationIssues = useMemo(
    () => services.validator.validate(aiConfig, { nodeKey: AI_SUMMARIZER_NODE_KEY, hasProviderResolver: true }).issues,
    [aiConfig, services.validator],
  );

  return (
    <div className="space-y-5">
      <AISummaryOptionsEditor
        config={config}
        onChange={(patch) => onChange({ ...config, ...patch })}
      />
      <AIWorkflowConfigPanel
        config={config}
        onChange={onChange}
        nodeKey={AI_SUMMARIZER_NODE_KEY}
        showPreview={false}
      />
      <AIWorkflowValidationPanel issues={validationIssues} />
      <AISummarizerPreviewPanel preview={preview} />
    </div>
  );
}

export function createSummarizerBuilderDefaultConfig(): Record<string, unknown> {
  return {
    builderType: "ai_summarizer",
    aiConfig: createDefaultSummarizerNodeConfig(),
  };
}

export function normalizeSummarizerBuilderConfig(config: Record<string, unknown>): Record<string, unknown> {
  const aiConfig = config.aiConfig && typeof config.aiConfig === "object"
    ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_SUMMARIZER_NODE_KEY)
    : createDefaultSummarizerNodeConfig();
  return {
    builderType: "ai_summarizer",
    aiConfig,
  };
}
