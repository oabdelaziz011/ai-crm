import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIPolicySelectorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIPolicySelector({ config, onChange, nodeKey }: AIPolicySelectorProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);
  const policies = aiConfig.policies ?? {};

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <Label className="text-sm font-medium">{ai("executionPolicy")}</Label>
        <p className="text-xs text-muted-foreground">{ai("executionPolicyHint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("maxTokens")}</Label>
          <Input
            type="number"
            min={1}
            value={policies.maxTokens ?? 1024}
            onChange={(event) =>
              onChange(
                patchAIWorkflowConfig(
                  config,
                  { policies: { ...policies, maxTokens: Number(event.target.value) || 1024 } },
                  nodeKey,
                ),
              )
            }
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("timeoutMs")}</Label>
          <Input
            type="number"
            min={1000}
            step={1000}
            value={policies.timeoutMs ?? 30_000}
            onChange={(event) =>
              onChange(
                patchAIWorkflowConfig(
                  config,
                  { policies: { ...policies, timeoutMs: Number(event.target.value) || 30_000 } },
                  nodeKey,
                ),
              )
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{ai("streaming")}</Label>
          <p className="text-xs text-muted-foreground">{ai("streamingHint")}</p>
        </div>
        <Switch
          checked={policies.streaming === true}
          onCheckedChange={(checked) =>
            onChange(patchAIWorkflowConfig(config, { policies: { ...policies, streaming: checked } }, nodeKey))
          }
        />
      </div>
    </div>
  );
}
