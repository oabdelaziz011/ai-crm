import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AITemperatureSliderProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AITemperatureSlider({ config, onChange, nodeKey }: AITemperatureSliderProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);
  const temperature = aiConfig.policies?.temperature ?? 0.2;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{ai("temperature")}</Label>
        <span className="text-xs text-muted-foreground">{temperature.toFixed(2)}</span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={[temperature]}
        onValueChange={([value]) =>
          onChange(
            patchAIWorkflowConfig(
              config,
              { policies: { ...aiConfig.policies, temperature: value ?? 0.2 } },
              nodeKey,
            ),
          )
        }
      />
    </div>
  );
}
