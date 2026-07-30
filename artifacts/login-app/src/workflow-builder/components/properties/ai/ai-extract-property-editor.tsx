import { useMemo } from "react";
import {
  AI_EXTRACT_NODE_KEY,
  createDefaultExtractNodeConfig,
  normalizeAIWorkflowNodeConfig,
} from "@workspace/ai-workflow-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { AIWorkflowConfigPanel } from "./ai-workflow-config-panel";
import { AIWorkflowValidationPanel } from "./ai-validation-panel";
import { AIWorkflowFeatureGate } from "./ai-workflow-feature-gate";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";
import { AIExtractionSchemaBuilder } from "./ai-extraction-schema-builder";
import { AIExtractInputEditor } from "./ai-extract-input-editor";
import { AIExtractPreviewPanel } from "./ai-extract-preview-panel";

export function AIExtractPropertyEditor({ config, onChange }: NodePropertyEditorProps) {
  const { services } = useAIWorkflowPlatformServices();
  const aiConfig = useMemo(
    () => readAIWorkflowConfig(config, AI_EXTRACT_NODE_KEY),
    [config],
  );

  const preview = useMemo(
    () => services.preview.preview({ config: aiConfig, workflowVariables: {} }),
    [aiConfig, services.preview],
  );

  const validationIssues = useMemo(
    () => services.validator.validate(aiConfig, { nodeKey: AI_EXTRACT_NODE_KEY, hasProviderResolver: true }).issues,
    [aiConfig, services.validator],
  );

  return (
    <AIWorkflowFeatureGate>
      <div className="space-y-5">
        <AIExtractInputEditor config={config} onChange={(patch) => onChange({ ...config, ...patch })} />
        <AIExtractionSchemaBuilder config={config} onChange={(patch) => onChange({ ...config, ...patch })} />
        <AIWorkflowConfigPanel
          config={config}
          onChange={onChange}
          nodeKey={AI_EXTRACT_NODE_KEY}
          showPreview={false}
        />
        <AIWorkflowValidationPanel issues={validationIssues} />
        <AIExtractPreviewPanel preview={preview} />
      </div>
    </AIWorkflowFeatureGate>
  );
}

export function createExtractBuilderDefaultConfig(): Record<string, unknown> {
  return {
    builderType: "ai_extract",
    aiConfig: createDefaultExtractNodeConfig(),
  };
}
