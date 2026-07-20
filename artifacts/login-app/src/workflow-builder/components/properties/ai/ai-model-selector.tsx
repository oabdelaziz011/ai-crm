import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIModelSelectorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIModelSelector({ config, onChange, nodeKey }: AIModelSelectorProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{ai("modelOverride")}</Label>
      <Input
        value={aiConfig.model ?? ""}
        placeholder={ai("useProviderDefault")}
        onChange={(event) =>
          onChange(patchAIWorkflowConfig(config, { model: event.target.value || null }, nodeKey))
        }
        className="rounded-xl bg-background/80"
      />
    </div>
  );
}
