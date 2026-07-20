import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { AI_OUTPUT_MODE_OPTIONS, patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIOutputModeSelectorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIOutputModeSelector({ config, onChange, nodeKey }: AIOutputModeSelectorProps) {
  const { ai, outputMode } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{ai("outputMode")}</Label>
      <Select
        value={aiConfig.outputMode}
        onValueChange={(value) =>
          onChange(
            patchAIWorkflowConfig(
              config,
              {
                outputMode: value as typeof aiConfig.outputMode,
                policies: {
                  ...aiConfig.policies,
                  responseFormat: value === "text" || value === "boolean" ? "text" : "json",
                },
              },
              nodeKey,
            ),
          )
        }
      >
        <SelectTrigger className="rounded-xl bg-background/80">
          <SelectValue placeholder={ai("selectOutputMode")} />
        </SelectTrigger>
        <SelectContent>
          {AI_OUTPUT_MODE_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {outputMode(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
