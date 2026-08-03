import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { OperationsDataGrid } from "@/components/universal-operations/queue/operations-data-grid";
import { OperationsWorkspacePanel } from "@/components/universal-operations/panel/operations-workspace-panel";
import { WorkspaceMetric } from "@/components/customer-workspace/workspace-ui";
import { useUniversalOperationsQueue } from "@/hooks/universal-operations";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";
import { translateOperationsWorkspaceName } from "@/lib/i18n/workspace-mock-labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OperationsQueuePage() {
  const { t } = useTranslation("common");
  const platform = useWorkspacePlatformOptional();
  const [localTemplate, setLocalTemplate] = useState("clinic");
  const templateKey = platform?.templateKey ?? localTemplate;
  const setTemplateKey = platform?.setTemplateKey ?? setLocalTemplate;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<OperationsRow | null>(null);

  const {
    config,
    columns,
    page,
    loading,
    query,
    updateSearch,
    updateSort,
    loadMore,
  } = useUniversalOperationsQueue(templateKey);

  const kpis = useMemo(() => {
    const rows = page?.rows ?? [];
    return {
      total: page?.total ?? 0,
      waiting: rows.filter((r) => r.statusId === "st_checked_in").length,
      paid: rows.filter((r) => r.paymentStatusId === "pay_paid").length,
      completed: rows.filter((r) => r.statusId === "st_completed").length,
    };
  }, [page]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            {config?.workspaceName
              ? translateOperationsWorkspaceName(t, templateKey, config.workspaceName)
              : t("universalOperations.queue.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.queue.subtitle")}</p>
        </div>
        <Select value={templateKey} onValueChange={setTemplateKey}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("universalOperations.queue.template")} />
          </SelectTrigger>
          <SelectContent>
            {(platform?.snapshot?.templates ?? []).length > 0
              ? platform!.snapshot!.templates.map((tpl) => (
                  <SelectItem key={tpl.key} value={tpl.key}>
                    {t(`workspacePlatform.${tpl.labelKey}`)}
                  </SelectItem>
                ))
              : (
                <>
                  <SelectItem value="clinic">{t("universalOperations.templates.clinic")}</SelectItem>
                  <SelectItem value="training_center">{t("universalOperations.templates.training")}</SelectItem>
                  <SelectItem value="automotive">{t("universalOperations.templates.automotive")}</SelectItem>
                </>
              )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceMetric label={t("universalOperations.kpi.total")} value={kpis.total} compact />
        <WorkspaceMetric label={t("universalOperations.kpi.waiting")} value={kpis.waiting} compact accent="warning" />
        <WorkspaceMetric label={t("universalOperations.kpi.paid")} value={kpis.paid} compact accent="success" />
        <WorkspaceMetric label={t("universalOperations.kpi.completed")} value={kpis.completed} compact accent="success" />
      </div>

      <OperationsDataGrid
        columns={columns}
        rows={page?.rows ?? []}
        loading={loading}
        search={query.search ?? ""}
        onSearchChange={updateSearch}
        sort={query.sort ?? []}
        onSortChange={updateSort}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={setSelectedRow}
        onLoadMore={loadMore}
        hasMore={page?.hasMore}
      />

      <OperationsWorkspacePanel
        row={selectedRow}
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        templateKey={templateKey}
      />
    </div>
  );
}
