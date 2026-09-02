import { lazy, Suspense, useMemo, useState } from "react";
import { Gauge, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import AccessDeniedPage from "@/pages/access-denied";
import { useAuthUser } from "@/hooks/use-rbac";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePlatformAiOpsAdminAudit,
  usePlatformAiOpsAlerts,
  usePlatformAiOpsBackgroundTasks,
  usePlatformAiOpsAgentWorkflows,
  usePlatformAiOpsKnowledgeSummary,
  usePlatformAiOpsKnowledgeDocuments,
  usePlatformAiOpsEmbeddingJobs,
  usePlatformAiOpsCostByCompany,
  usePlatformAiOpsCostTrends,
  usePlatformAiOpsErrorGroups,
  usePlatformAiOpsFeatureMatrix,
  usePlatformAiOpsKpis,
  usePlatformAiOpsProviderHealth,
  usePlatformAiOpsRequestFeed,
  usePlatformAiOpsToolStats,
} from "@/hooks/platform-ai-operations/use-platform-ai-operations";
import { exportRowsToCsv, exportRowsToJson } from "@/lib/platform-ai-operations";
import { OpsKpiGrid } from "@/components/platform-ai-operations/ops-kpi-grid";
import { OpsProviderHealth } from "@/components/platform-ai-operations/ops-provider-health";
import { OpsRequestMonitor } from "@/components/platform-ai-operations/tables/ops-request-monitor";
import { OpsToolMonitor } from "@/components/platform-ai-operations/ops-tool-monitor";
import { OpsBackgroundTasks } from "@/components/platform-ai-operations/ops-background-tasks";
import { OpsAgentWorkflows } from "@/components/platform-ai-operations/ops-agent-workflows";
import { OpsKnowledgeDashboard } from "@/components/platform-ai-operations/ops-knowledge-dashboard";
import { OpsErrorCenter } from "@/components/platform-ai-operations/ops-error-center";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { OpsCostDashboard } from "@/components/platform-ai-operations/ops-cost-dashboard";
import { OpsFeatureFlags } from "@/components/platform-ai-operations/ops-feature-flags";
import { OpsAuditLog } from "@/components/platform-ai-operations/ops-audit-log";
import { OpsAlertsBanner } from "@/components/platform-ai-operations/ops-alerts-banner";
import { OpsGlobalSearch } from "@/components/platform-ai-operations/ops-global-search";
import { ListPagination } from "@/components/ui/list-pagination";

const OpsTrendChart = lazy(() =>
  import("@/components/platform-ai-operations/charts/ops-trend-chart").then((module) => ({
    default: module.OpsTrendChart,
  })),
);

export function PlatformAiOperationsPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin } = useAuthUser();
  const enabled = isSuperAdmin;
  const [search, setSearch] = useState("");
  const [requestPage, setRequestPage] = useState(0);

  const kpis = usePlatformAiOpsKpis(enabled);
  const health = usePlatformAiOpsProviderHealth(enabled);
  const requests = usePlatformAiOpsRequestFeed(enabled, search, requestPage);
  const tools = usePlatformAiOpsToolStats(enabled);
  const tasks = usePlatformAiOpsBackgroundTasks(enabled);
  const agentWorkflows = usePlatformAiOpsAgentWorkflows(enabled);
  const knowledgeSummary = usePlatformAiOpsKnowledgeSummary(enabled);
  const knowledgeDocuments = usePlatformAiOpsKnowledgeDocuments(enabled);
  const embeddingJobs = usePlatformAiOpsEmbeddingJobs(enabled);
  const errors = usePlatformAiOpsErrorGroups(enabled);
  const costTrends = usePlatformAiOpsCostTrends(enabled);
  const costByCompany = usePlatformAiOpsCostByCompany(enabled);
  const features = usePlatformAiOpsFeatureMatrix(enabled);
  const audit = usePlatformAiOpsAdminAudit(enabled);
  const alerts = usePlatformAiOpsAlerts(enabled);

  const exportRows = useMemo(
    () =>
      (requests.data ?? []).map((row) => ({
        time: row.recorded_at,
        company: row.company_name,
        module: row.module,
        model: row.model,
        tokens: row.total_tokens,
        latency_ms: row.latency_ms,
        cost: row.estimated_cost,
        status: row.result_status,
        correlation_id: row.correlation_id,
      })),
    [requests.data],
  );

  if (!isSuperAdmin) {
    return <AccessDeniedPage requiredPermission="platform.admin" />;
  }

  const queryError =
    kpis.error ?? health.error ?? requests.error ?? errors.error ?? costTrends.error;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">{t("platformAiOps.title")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("platformAiOps.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          <ShieldAlert className="size-4" />
          {t("platformAiOps.superAdminOnly")}
        </div>
      </div>

      {queryError && <DashboardErrorBanner message={queryError.message} />}

      <OpsAlertsBanner alerts={alerts.data ?? []} />

      <OpsKpiGrid data={kpis.data} loading={kpis.isLoading} />

      <OpsProviderHealth data={health.data} loading={health.isLoading} />

      <OpsGlobalSearch
        value={search}
        onChange={(value) => {
          setSearch(value);
          setRequestPage(0);
        }}
        onExportCsv={() => exportRowsToCsv(exportRows, "ai-operations-requests.csv")}
        onExportJson={() => exportRowsToJson(exportRows, "ai-operations-requests.json")}
      />

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/30 p-1">
          <TabsTrigger value="requests">{t("platformAiOps.tabs.requests")}</TabsTrigger>
          <TabsTrigger value="tools">{t("platformAiOps.tabs.tools")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("platformAiOps.tabs.tasks")}</TabsTrigger>
          <TabsTrigger value="knowledge">{t("platformAiOps.tabs.knowledge")}</TabsTrigger>
          <TabsTrigger value="agents">{t("platformAiOps.tabs.agents")}</TabsTrigger>
          <TabsTrigger value="errors">{t("platformAiOps.tabs.errors")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("platformAiOps.tabs.analytics")}</TabsTrigger>
          <TabsTrigger value="features">{t("platformAiOps.tabs.features")}</TabsTrigger>
          <TabsTrigger value="audit">{t("platformAiOps.tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <OpsRequestMonitor rows={requests.data ?? []} loading={requests.isLoading} />
          <ListPagination
            className="justify-end"
            page={requestPage + 1}
            totalPages={requestPage + 1 + ((requests.data?.length ?? 0) >= 50 ? 1 : 0)}
            pageInfoLabel={t("platformAiOps.pagination.page", { page: requestPage + 1 })}
            previousLabel={t("platformAiOps.pagination.prev")}
            nextLabel={t("platformAiOps.pagination.next")}
            canPrevious={requestPage > 0}
            canNext={(requests.data?.length ?? 0) >= 50}
            onPrevious={() => setRequestPage((p) => Math.max(0, p - 1))}
            onNext={() => setRequestPage((p) => p + 1)}
            size="sm"
          />
        </TabsContent>

        <TabsContent value="tools">
          <OpsToolMonitor tools={tools.data ?? []} loading={tools.isLoading} />
        </TabsContent>

        <TabsContent value="tasks">
          <OpsBackgroundTasks tasks={tasks.data ?? []} loading={tasks.isLoading} />
        </TabsContent>

        <TabsContent value="knowledge">
          <OpsKnowledgeDashboard
            summary={knowledgeSummary.data}
            documents={knowledgeDocuments.data ?? []}
            jobs={embeddingJobs.data ?? []}
            loading={knowledgeSummary.isLoading || knowledgeDocuments.isLoading}
          />
        </TabsContent>

        <TabsContent value="agents">
          <OpsAgentWorkflows workflows={agentWorkflows.data ?? []} loading={agentWorkflows.isLoading} />
        </TabsContent>

        <TabsContent value="errors">
          <OpsErrorCenter errors={errors.data ?? []} loading={errors.isLoading} />
        </TabsContent>

        <TabsContent value="analytics" className="grid gap-4 lg:grid-cols-2">
          <Suspense fallback={<DashboardPageFallback />}>
          <OpsTrendChart
            title={t("platformAiOps.charts.tokens")}
            data={costTrends.data ?? []}
            dataKey="total_tokens"
            loading={costTrends.isLoading}
            valueFormatter={(v) => v.toLocaleString()}
          />
          <OpsTrendChart
            title={t("platformAiOps.charts.cost")}
            data={costTrends.data ?? []}
            dataKey="estimated_cost"
            loading={costTrends.isLoading}
            valueFormatter={(v) => `$${v.toFixed(4)}`}
          />
          </Suspense>
          <div className="lg:col-span-2">
            <OpsCostDashboard companies={costByCompany.data ?? []} loading={costByCompany.isLoading} />
          </div>
        </TabsContent>

        <TabsContent value="features">
          <OpsFeatureFlags rows={features.data ?? []} loading={features.isLoading} />
        </TabsContent>

        <TabsContent value="audit">
          <OpsAuditLog rows={audit.data ?? []} loading={audit.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PlatformAiOperationsPage;
