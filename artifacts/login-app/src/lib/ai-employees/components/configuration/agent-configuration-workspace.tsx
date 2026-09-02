import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardPageFallback } from "@/components/dashboard/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeConfigurationUpdate, AiEmployeeRecord } from "@/lib/ai-employees/types";

const GeneralConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/general-config-tab").then((module) => ({
    default: module.GeneralConfigTab,
  })),
);
const ProviderConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/provider-config-tab").then((module) => ({
    default: module.ProviderConfigTab,
  })),
);
const ModelConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/model-config-tab").then((module) => ({
    default: module.ModelConfigTab,
  })),
);
const PromptConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/prompt-config-tab").then((module) => ({
    default: module.PromptConfigTab,
  })),
);
const KnowledgeConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/knowledge-config-tab").then((module) => ({
    default: module.KnowledgeConfigTab,
  })),
);
const ToolsConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/tools-config-tab").then((module) => ({
    default: module.ToolsConfigTab,
  })),
);
const RuntimeConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/runtime-config-tab").then((module) => ({
    default: module.RuntimeConfigTab,
  })),
);
const LimitsConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/limits-config-tab").then((module) => ({
    default: module.LimitsConfigTab,
  })),
);
const PreviewConfigTab = lazy(() =>
  import("@/lib/ai-employees/components/configuration/tabs/preview-config-tab").then((module) => ({
    default: module.PreviewConfigTab,
  })),
);

export type AgentConfigurationTabId =
  | "general"
  | "provider"
  | "model"
  | "prompt"
  | "knowledge"
  | "tools"
  | "runtime"
  | "limits"
  | "preview";

type AgentConfigurationWorkspaceProps = {
  employee: AiEmployeeRecord;
  preview: AgentRuntimeConfiguration | null;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (patch: AiEmployeeConfigurationUpdate) => void;
  /** Optional initial nested tab (e.g. deep-link Capabilities & tools → tools). */
  initialTab?: AgentConfigurationTabId;
};

const TAB_ORDER: AgentConfigurationTabId[] = [
  "general",
  "provider",
  "model",
  "prompt",
  "knowledge",
  "tools",
  "runtime",
  "limits",
  "preview",
];

function resolveInitialTab(value: AgentConfigurationTabId | undefined): AgentConfigurationTabId {
  return value && TAB_ORDER.includes(value) ? value : "general";
}

export const AgentConfigurationWorkspace = memo(function AgentConfigurationWorkspace({
  employee,
  preview,
  canEdit,
  isSaving,
  onSave,
  initialTab,
}: AgentConfigurationWorkspaceProps) {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<AgentConfigurationTabId>(() =>
    resolveInitialTab(initialTab),
  );

  useEffect(() => {
    if (initialTab && TAB_ORDER.includes(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const issueCount = preview?.validationIssues.filter((issue) => issue.severity === "error").length ?? 0;

  const tabProps = useMemo(
    () => ({ employee, preview, canEdit, isSaving, onSave }),
    [canEdit, employee, isSaving, onSave, preview],
  );

  return (
    <DashboardCard className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.config.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("aiEmployees.config.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={preview?.ready ? "default" : "secondary"}>
            {preview?.ready ? t("aiEmployees.config.ready") : t("aiEmployees.config.notReady")}
          </Badge>
          {issueCount > 0 ? (
            <Badge variant="destructive">
              {t("aiEmployees.config.issueCount", { count: issueCount })}
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AgentConfigurationTabId)}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1 bg-muted/30 p-1">
          {TAB_ORDER.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-lg">
              {t(`aiEmployees.config.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<DashboardPageFallback />}>
          <TabsContent value="general">
            {activeTab === "general" ? <GeneralConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="provider">
            {activeTab === "provider" ? <ProviderConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="model">
            {activeTab === "model" ? <ModelConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="prompt">
            {activeTab === "prompt" ? <PromptConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="knowledge">
            {activeTab === "knowledge" ? <KnowledgeConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="tools">
            {activeTab === "tools" ? <ToolsConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="runtime">
            {activeTab === "runtime" ? <RuntimeConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="limits">
            {activeTab === "limits" ? <LimitsConfigTab {...tabProps} /> : null}
          </TabsContent>
          <TabsContent value="preview">
            {activeTab === "preview" ? <PreviewConfigTab {...tabProps} /> : null}
          </TabsContent>
        </Suspense>
      </Tabs>
    </DashboardCard>
  );
});
