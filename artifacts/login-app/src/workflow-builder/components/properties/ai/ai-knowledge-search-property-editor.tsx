import { useMemo } from "react";
import {
  AI_KNOWLEDGE_SEARCH_NODE_KEY,
  createDefaultKnowledgeSearchNodeConfig,
} from "@workspace/ai-workflow-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { AIWorkflowValidationPanel } from "./ai-validation-panel";
import { AIWorkflowFeatureGate } from "./ai-workflow-feature-gate";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";
import { AIKnowledgeSearchConfigEditor } from "./ai-knowledge-search-config-editor";
import { AIKnowledgeSearchPreviewPanel } from "./ai-knowledge-search-preview-panel";

export function AIKnowledgeSearchPropertyEditor({ config, onChange }: NodePropertyEditorProps) {
  const { services } = useAIWorkflowPlatformServices();
  const aiConfig = useMemo(
    () => readAIWorkflowConfig(config, AI_KNOWLEDGE_SEARCH_NODE_KEY),
    [config],
  );

  const preview = useMemo(
    () => services.preview.preview({ config: aiConfig, workflowVariables: {} }),
    [aiConfig, services.preview],
  );

  const validationIssues = useMemo(
    () =>
      services.validator.validate(aiConfig, {
        nodeKey: AI_KNOWLEDGE_SEARCH_NODE_KEY,
        hasProviderResolver: true,
      }).issues,
    [aiConfig, services.validator],
  );

  return (
    <AIWorkflowFeatureGate>
      <div className="space-y-5">
        <AIKnowledgeSearchConfigEditor config={config} onChange={(patch) => onChange({ ...config, ...patch })} />
        <AIWorkflowValidationPanel issues={validationIssues} />
        <AIKnowledgeSearchPreviewPanel preview={preview} />
      </div>
    </AIWorkflowFeatureGate>
  );
}

export function createKnowledgeSearchBuilderDefaultConfig(): Record<string, unknown> {
  return {
    builderType: "ai_knowledge_search",
    aiConfig: createDefaultKnowledgeSearchNodeConfig(),
  };
}
