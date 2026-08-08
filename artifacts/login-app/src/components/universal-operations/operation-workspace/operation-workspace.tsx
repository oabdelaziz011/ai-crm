import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OperationsRow, OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationWorkspaceHeader } from "@/components/universal-operations/operation-workspace/operation-workspace-header";
import { OperationQuickActionBar } from "@/components/universal-operations/operation-workspace/operation-quick-action-bar";
import { OperationWorkflowStrip } from "@/components/universal-operations/operation-workspace/operation-workflow-strip";
import { OperationWidgetRenderer } from "@/components/universal-operations/operation-workspace/operation-widget-renderer";
import { useCustomer360Workspace } from "@/hooks/universal-operations/use-customer360-workspace";
import {
  resolveWorkflowState,
  type OperationWidgetContext,
  type OperationWorkspaceTabId,
} from "@/lib/universal-operations/widget-registry";
import type { ResolvedOperationsAction } from "@/lib/universal-operations/action-registry";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

const TABS: OperationWorkspaceTabId[] = [
  "overview",
  "timeline",
  "customer",
  "payments",
  "notes",
  "files",
  "ai",
  "history",
  "related",
];

export type OperationWorkspaceActionApi = {
  getQuickBarActions: (row: OperationsRow) => ResolvedOperationsAction[];
  requestAction: (action: ResolvedOperationsAction, row: OperationsRow) => void;
  executingId?: string | null;
};

export function OperationWorkspace({
  row,
  open,
  onClose,
  config,
  templateKey = "clinic",
  actions,
  initialTab = "overview",
}: {
  row: OperationsRow | null;
  open: boolean;
  onClose: () => void;
  config?: OperationsWorkspaceConfig;
  templateKey?: string;
  actions: OperationWorkspaceActionApi;
  initialTab?: OperationWorkspaceTabId;
}) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<OperationWorkspaceTabId>(initialTab);
  const { data: customer360, isLoading } = useCustomer360Workspace(row, "manager");

  const workflow = useMemo(
    () => (row ? resolveWorkflowState(row, config, templateKey) : null),
    [row, config, templateKey],
  );

  const widgetCtx: OperationWidgetContext | null = useMemo(() => {
    if (!row) return null;
    return {
      row,
      config,
      customer360: customer360 && !("isEmpty" in customer360 && customer360.isEmpty) ? customer360 : null,
      templateKey,
      activeTab: tab,
    };
  }, [row, config, customer360, templateKey, tab]);

  const quickActions = row ? actions.getQuickBarActions(row) : [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="relative flex h-full w-[min(620px,50vw)] min-w-[520px] max-w-[50vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[50vw] [&>button.absolute]:hidden"
      >
        {!row ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t("universalOperations.workspace.empty.selection")}
          </div>
        ) : (
          <>
            <OperationWorkspaceHeader row={row} onClose={onClose} />
            {workflow && (
              <div className="shrink-0 border-b border-border/40 px-3 py-2">
                <OperationWorkflowStrip steps={workflow.steps} currentIndex={workflow.currentIndex} />
              </div>
            )}
            <OperationQuickActionBar
              row={row}
              actions={quickActions}
              executingId={actions.executingId}
              onSelect={actions.requestAction}
            />
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as OperationWorkspaceTabId)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 overflow-x-auto border-b border-border/50 px-2 py-1.5">
                <TabsList className="h-8 w-max justify-start bg-transparent p-0">
                  {TABS.map((id) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                    >
                      {t(`universalOperations.workspace.tabs.${id}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {isLoading && !widgetCtx?.customer360 ? (
                  <DashboardPageFallback />
                ) : (
                  TABS.map((id) => (
                    <TabsContent key={id} value={id} className="mt-0 focus-visible:ring-0">
                      {widgetCtx && <OperationWidgetRenderer tab={id} ctx={{ ...widgetCtx, activeTab: id }} />}
                    </TabsContent>
                  ))
                )}
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
