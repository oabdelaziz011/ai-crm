import { useMemo } from "react";
import {
  AI_DECISION_NODE_KEY,
  createDefaultDecisionNodeConfig,
  normalizeAIWorkflowNodeConfig,
} from "@workspace/ai-workflow-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { AIWorkflowConfigPanel } from "./ai-workflow-config-panel";
import { AIWorkflowValidationPanel } from "./ai-validation-panel";
import { AIWorkflowFeatureGate } from "./ai-workflow-feature-gate";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";
import { AIDecisionConfigEditor } from "./ai-decision-config-editor";
import { AIDecisionOutcomeEditor } from "./ai-decision-outcome-editor";
import { AIDecisionPreviewPanel } from "./ai-decision-preview-panel";

export function AIDecisionPropertyEditor({ config, onChange }: NodePropertyEditorProps) {
  const { services } = useAIWorkflowPlatformServices();
  const aiConfig = useMemo(
    () => readAIWorkflowConfig(config, AI_DECISION_NODE_KEY),
    [config],
  );

  const preview = useMemo(
    () => services.preview.preview({ config: aiConfig, workflowVariables: {} }),
    [aiConfig, services.preview],
  );

  const validationIssues = useMemo(
    () => services.validator.validate(aiConfig, { nodeKey: AI_DECISION_NODE_KEY, hasProviderResolver: true }).issues,
    [aiConfig, services.validator],
  );

  return (
    <AIWorkflowFeatureGate>
      <div className="space-y-5">
        <AIDecisionConfigEditor config={config} onChange={(patch) => onChange({ ...config, ...patch })} />
        <AIDecisionOutcomeEditor config={config} onChange={(patch) => onChange({ ...config, ...patch })} />
        <AIWorkflowConfigPanel
          config={config}
          onChange={onChange}
          nodeKey={AI_DECISION_NODE_KEY}
          showPreview={false}
        />
        <AIWorkflowValidationPanel issues={validationIssues} />
        <AIDecisionPreviewPanel preview={preview} />
      </div>
    </AIWorkflowFeatureGate>
  );
}

export function createDecisionBuilderDefaultConfig(): Record<string, unknown> {
  return {
    builderType: "ai_decision",
    aiConfig: createDefaultDecisionNodeConfig(),
  };
}
