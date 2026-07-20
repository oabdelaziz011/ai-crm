import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePromptTemplates } from "@/hooks/prompts/use-prompt-templates";
import { useAuth } from "@/context/auth-context";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIPromptSelectorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIPromptSelector({ config, onChange, nodeKey }: AIPromptSelectorProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: templates = [], isLoading } = usePromptTemplates(companyId, Boolean(companyId));
  const aiConfig = readAIWorkflowConfig(config, nodeKey);

  const options = useMemo(
    () =>
      templates.map((template) => ({
        value: template.key,
        label: template.display_name ?? template.key,
        description: template.description ?? undefined,
      })),
    [templates],
  );

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{ai("promptTemplate")}</Label>
      <SearchableSelect
        value={aiConfig.promptTemplateKey ?? ""}
        onValueChange={(value) => onChange(patchAIWorkflowConfig(config, { promptTemplateKey: value }, nodeKey))}
        options={options}
        placeholder={isLoading ? ai("loadingTemplates") : ai("selectPromptTemplate")}
        searchPlaceholder={ai("searchPrompts")}
        emptyLabel={ai("noPromptTemplates")}
        disabled={!companyId || isLoading}
      />
    </div>
  );
}
