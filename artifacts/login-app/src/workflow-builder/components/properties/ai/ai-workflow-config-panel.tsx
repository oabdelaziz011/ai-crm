import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { useAIWorkflowPlatformServices } from "@/lib/ai-workflow-platform";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { AIPromptSelector } from "./ai-prompt-selector";
import { AIProviderSelector } from "./ai-provider-selector";
import { AIModelSelector } from "./ai-model-selector";
import { AITemperatureSlider } from "./ai-temperature-slider";
import { AIKnowledgeToggle } from "./ai-knowledge-toggle";
import { AIOutputModeSelector } from "./ai-output-mode-selector";
import { AIPolicySelector } from "./ai-policy-selector";
import { AIWorkflowPreviewPanel } from "./ai-preview-panel";
import { AIWorkflowValidationPanel } from "./ai-validation-panel";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIWorkflowConfigPanelProps = NodePropertyEditorProps & {
  nodeKey?: string;
  showPreview?: boolean;
};

export function AIWorkflowConfigPanel({
  config,
  onChange,
  nodeKey = "custom.ai",
  showPreview = true,
}: AIWorkflowConfigPanelProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const { services } = useAIWorkflowPlatformServices();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);

  const preview = useMemo(
    () => (showPreview ? services.preview.preview({ config: aiConfig }) : null),
    [aiConfig, services.preview, showPreview],
  );

  const validationIssues = useMemo(
    () => services.validator.validate(aiConfig, { nodeKey, hasProviderResolver: true }).issues,
    [aiConfig, nodeKey, services.validator],
  );

  return (
    <div className="space-y-5">
      <AIPromptSelector config={config} onChange={onChange} nodeKey={nodeKey} />
      <AIProviderSelector config={config} onChange={onChange} nodeKey={nodeKey} />
      <AIModelSelector config={config} onChange={onChange} nodeKey={nodeKey} />
      <AITemperatureSlider config={config} onChange={onChange} nodeKey={nodeKey} />
      <AIKnowledgeToggle config={config} onChange={onChange} nodeKey={nodeKey} />
      <AIOutputModeSelector config={config} onChange={onChange} nodeKey={nodeKey} />
      <AIPolicySelector config={config} onChange={onChange} nodeKey={nodeKey} />

      <div className="space-y-2">
        <Label className="text-sm font-medium">{ai("outputVariable")}</Label>
        <Input
          value={aiConfig.outputVariable ?? ""}
          placeholder={`ai_${nodeKey.replace(/\./g, "_")}`}
          onChange={(event) =>
            onChange(patchAIWorkflowConfig(config, { outputVariable: event.target.value || null }, nodeKey))
          }
          className="rounded-xl bg-background/80"
        />
      </div>

      <AIWorkflowValidationPanel issues={validationIssues} />
      {showPreview ? <AIWorkflowPreviewPanel preview={preview} /> : null}
    </div>
  );
}

export {
  AIPromptSelector,
  AIProviderSelector,
  AIModelSelector,
  AITemperatureSlider,
  AIKnowledgeToggle,
  AIOutputModeSelector,
  AIPolicySelector,
  AIWorkflowPreviewPanel,
  AIWorkflowValidationPanel,
};
