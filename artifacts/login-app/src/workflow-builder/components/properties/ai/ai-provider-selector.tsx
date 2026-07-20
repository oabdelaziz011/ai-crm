import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { useAuth } from "@/context/auth-context";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { patchAIWorkflowConfig, readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIProviderSelectorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nodeKey?: string;
};

export function AIProviderSelector({ config, onChange, nodeKey }: AIProviderSelectorProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: connections = [], isLoading } = useAiProviderConnectionsAdmin(companyId);
  const aiConfig = readAIWorkflowConfig(config, nodeKey);

  const options = useMemo(
    () =>
      connections
        .filter((connection) => connection.is_enabled)
        .map((connection) => ({
          value: connection.id,
          label: connection.display_name,
          description: connection.ai_provider_definition?.display_name ?? connection.ai_provider_definition?.key,
        })),
    [connections],
  );

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{ai("providerConnection")}</Label>
      <SearchableSelect
        value={aiConfig.providerConnectionId ?? ""}
        onValueChange={(value) =>
          onChange(
            patchAIWorkflowConfig(
              config,
              {
                providerConnectionId: value,
                providerKey:
                  connections.find((entry) => entry.id === value)?.ai_provider_definition?.key ?? null,
              },
              nodeKey,
            ),
          )
        }
        options={options}
        placeholder={isLoading ? ai("loadingProviders") : ai("selectProviderConnection")}
        searchPlaceholder={ai("searchProviders")}
        emptyLabel={ai("noProviderConnections")}
        disabled={!companyId || isLoading}
      />
    </div>
  );
}
