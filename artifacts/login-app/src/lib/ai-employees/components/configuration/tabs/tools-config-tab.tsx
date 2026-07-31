import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function ToolsConfigTab({ employee, preview, canEdit, isSaving, onSave }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const tools = preview?.tools;

  const toggleTool = (toolKey: string, enabled: boolean) => {
    const currentDisabled = new Set(employee.runtimeConfiguration.disabledToolKeys);
    if (enabled) {
      currentDisabled.delete(toolKey);
    } else {
      currentDisabled.add(toolKey);
    }
    onSave({ disabledToolKeys: [...currentDisabled] });
  };

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.tools")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.fields.allowedTools"), value: tools?.allowedKeys.length ?? 0 },
            { label: t("aiEmployees.config.fields.enabledTools"), value: tools?.enabledKeys.length ?? 0 },
            { label: t("aiEmployees.config.fields.disabledTools"), value: tools?.disabledKeys.length ?? 0 },
          ]}
        />
      </ConfigSection>
      {tools && tools.entries.length > 0 ? (
        <ConfigSection title={t("aiEmployees.config.sections.toolCatalog")}>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {tools.entries.map((tool) => (
              <div key={tool.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{tool.displayName}</span>
                    <Badge variant="outline">{tool.category}</Badge>
                    <Badge variant={tool.riskLevel === "critical" ? "destructive" : "secondary"}>
                      {tool.riskLevel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tool.permissionSummary}</p>
                </div>
                {canEdit ? (
                  <Switch
                    checked={tool.enabled}
                    disabled={isSaving}
                    onCheckedChange={(checked) => toggleTool(tool.key, checked)}
                  />
                ) : (
                  <Badge variant={tool.enabled ? "default" : "secondary"}>
                    {tool.enabled ? t("aiEmployees.config.fields.enabled") : t("aiEmployees.config.fields.disabled")}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </ConfigSection>
      ) : null}
      <ValidationList preview={preview} />
    </div>
  );
}
