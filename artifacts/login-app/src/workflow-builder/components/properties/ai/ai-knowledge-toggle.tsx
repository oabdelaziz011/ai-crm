import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIKnowledgeToggleProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIKnowledgeToggle({ config, onChange, nodeKey }: AIKnowledgeToggleProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, nodeKey);
  const enabled = aiConfig.knowledge?.enabled === true;

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{ai("knowledgeRetrieval")}</Label>
        <p className="text-xs text-muted-foreground">{ai("knowledgeRetrievalHint")}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) =>
          onChange(
            patchAIWorkflowConfig(
              config,
              { knowledge: { ...aiConfig.knowledge, enabled: checked } },
              nodeKey,
            ),
          )
        }
      />
    </div>
  );
}
