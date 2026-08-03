import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { OPERATIONS_CONFIG_TABS } from "@workspace/universal-operations-engine";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations";
import { useConfigurationCommands } from "@/hooks/universal-operations/use-configuration-commands";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function OperationsConfigurationPage() {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<OperationsConfigTab>("general");
  const { data: config } = useUniversalOperationsConfig("clinic");
  const { saveDraft, publish, isReady } = useConfigurationCommands("clinic");

  const [workspaceName, setWorkspaceName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [rowEntityName, setRowEntityName] = useState("");
  const [customerLabel, setCustomerLabel] = useState("Customer");

  useEffect(() => {
    if (!config) return;
    setWorkspaceName(config.workspaceName);
    setModuleName(config.moduleName);
    setRowEntityName(config.rowEntityName);
    setCustomerLabel(config.terminology.customer ?? "Customer");
  }, [config]);

  const buildPatch = () => {
    if (!config) return null;
    return {
      ...config,
      workspaceName,
      moduleName,
      rowEntityName,
      terminology: {
        ...config.terminology,
        customer: customerLabel,
      },
      updatedAt: new Date().toISOString(),
    } as unknown as Record<string, unknown>;
  };

  const handleSaveDraft = async () => {
    const patch = buildPatch();
    if (!patch) return;
    try {
      await saveDraft.mutateAsync(patch);
      toast.success(t("universalOperations.configuration.saveSuccess", "Configuration draft saved."));
    } catch {
      toast.error(t("universalOperations.configuration.saveError", "Failed to save configuration."));
    }
  };

  const handlePublish = async () => {
    const patch = buildPatch();
    if (!patch) return;
    try {
      await saveDraft.mutateAsync(patch);
      await publish.mutateAsync("Published from operations configuration UI");
      toast.success(t("universalOperations.configuration.publishSuccess", "Configuration published."));
    } catch {
      toast.error(t("universalOperations.configuration.publishError", "Failed to publish configuration."));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("universalOperations.configuration.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.configuration.subtitle")}</p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {OPERATIONS_CONFIG_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === tab
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {t(`universalOperations.configuration.tabs.${tab}`)}
          </button>
        ))}
      </nav>

      {activeTab === "general" && config && (
        <WorkspacePanel title={t("universalOperations.configuration.general.title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("universalOperations.configuration.general.workspaceName")}</Label>
              <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("universalOperations.configuration.general.moduleName")}</Label>
              <Input value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("universalOperations.configuration.general.rowEntity")}</Label>
              <Input value={rowEntityName} onChange={(e) => setRowEntityName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("universalOperations.configuration.general.customerLabel")}</Label>
              <Input value={customerLabel} onChange={(e) => setCustomerLabel(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void handleSaveDraft()}
              disabled={!isReady || saveDraft.isPending}
              variant="outline"
            >
              {t("universalOperations.configuration.saveDraft", "Save Draft")}
            </Button>
            <Button
              onClick={() => void handlePublish()}
              disabled={!isReady || publish.isPending || saveDraft.isPending}
            >
              {t("universalOperations.configuration.save")}
            </Button>
          </div>
        </WorkspacePanel>
      )}

      {activeTab === "columns" && config && (
        <WorkspacePanel title={t("universalOperations.configuration.columns.title")}>
          <div className="space-y-2">
            {config.columns.map((col) => (
              <div key={col.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{col.displayName}</p>
                  <p className="text-[10px] text-muted-foreground">{col.internalName} · {col.type}</p>
                </div>
                <span className="text-[10px] uppercase text-muted-foreground">{col.visible ? "Visible" : "Hidden"}</span>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      )}

      {activeTab === "statuses" && config && (
        <WorkspacePanel title={t("universalOperations.configuration.statuses.title")}>
          <div className="flex flex-wrap gap-2">
            {config.statuses.map((s) => (
              <span
                key={s.id}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: `${s.color}22`, color: s.color }}
              >
                {s.displayName}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("universalOperations.configuration.statuses.flowHint")}</p>
        </WorkspacePanel>
      )}

      {!["general", "columns", "statuses"].includes(activeTab) && (
        <WorkspacePanel title={t(`universalOperations.configuration.tabs.${activeTab}`)}>
          <p className="text-sm text-muted-foreground">
            {t("universalOperations.configuration.domainHint", "Configure this domain through the Enterprise Configuration Platform.")}
          </p>
        </WorkspacePanel>
      )}
    </div>
  );
}
