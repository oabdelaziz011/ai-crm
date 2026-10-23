import { Bot, GitBranch, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import type { ChannelWorkflowBindingListItem } from "@/lib/channel-workflow-binding/types";
import { cn } from "@/lib/utils";

type ChannelInboundRoutingStripProps = {
  binding: ChannelWorkflowBindingListItem | null | undefined;
  /** Published AI employee currently tagged for this company channel. */
  aiEmployeeName?: string | null;
  loading?: boolean;
  disabling?: boolean;
  enabling?: boolean;
  /** When true, hide/disable connect/manage actions (e.g. commercial entitlement). */
  actionsDisabled?: boolean;
  onDisableWorkflow?: () => void;
  onEnableWorkflow?: () => void;
  onConfigure: () => void;
  className?: string;
};

/** BA-friendly strip: who answers inbound messages on this messaging channel. */
export function ChannelInboundRoutingStrip({
  binding,
  aiEmployeeName = null,
  loading = false,
  disabling = false,
  enabling = false,
  actionsDisabled = false,
  onDisableWorkflow,
  onEnableWorkflow,
  onConfigure,
  className,
}: ChannelInboundRoutingStripProps) {
  const { t } = useTranslation("common");
  const workflowActive = Boolean(binding?.isEnabled);
  const hasAssignedFlow = Boolean(binding?.automationFlowId);
  const flowName =
    binding?.flowName?.trim() || t("dashboard.channels.inboundRouting.unnamedWorkflow");
  const employeeName = aiEmployeeName?.trim() || null;
  const busy = disabling || enabling || actionsDisabled;

  if (loading) {
    return (
      <div
        className={cn(
          "mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t("dashboard.channels.inboundRouting.loading")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border px-3 py-3",
        workflowActive
          ? "border-amber-500/30 bg-amber-500/[0.07]"
          : "border-emerald-500/25 bg-emerald-500/[0.06]",
        className,
      )}
      data-testid="channel-inbound-routing-strip"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("dashboard.channels.inboundRouting.label")}
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className={cn(
              "mt-0.5 rounded-lg p-1.5",
              workflowActive
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {workflowActive ? (
              <GitBranch className="size-4" aria-hidden />
            ) : (
              <Bot className="size-4" aria-hidden />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold leading-snug">
              {workflowActive
                ? t("dashboard.channels.inboundRouting.connectedWorkflow", { name: flowName })
                : employeeName
                  ? t("dashboard.channels.inboundRouting.connectedEmployee", {
                      name: employeeName,
                    })
                  : t("dashboard.channels.inboundRouting.modeAi")}
            </p>
            <p className="text-xs text-muted-foreground">
              {workflowActive
                ? t("dashboard.channels.inboundRouting.workflowHint", { name: flowName })
                : employeeName
                  ? t("dashboard.channels.inboundRouting.aiHintNamed", { name: employeeName })
                  : hasAssignedFlow
                    ? t("dashboard.channels.inboundRouting.aiHintWithAssignedFlow", {
                        name: flowName,
                      })
                    : t("dashboard.channels.inboundRouting.aiHint")}
            </p>
            {!workflowActive && !employeeName ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("dashboard.channels.inboundRouting.noEmployeeLinked")}
              </p>
            ) : null}
          </div>
        </div>

        <Can permission="channels.manage">
          <div className="flex flex-wrap items-center gap-2">
            {actionsDisabled ? (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.channels.featureNotEntitled")}
              </p>
            ) : null}
            <Button
              size="sm"
              variant={workflowActive ? "outline" : "default"}
              className="gap-1.5"
              disabled={busy || !workflowActive}
              aria-pressed={!workflowActive}
              onClick={onDisableWorkflow}
              data-testid="channel-disable-workflow"
            >
              {disabling ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
              {t("dashboard.channels.inboundRouting.useEmployee")}
            </Button>
            <Button
              size="sm"
              variant={workflowActive ? "default" : "outline"}
              className="gap-1.5"
              disabled={busy || workflowActive}
              aria-pressed={workflowActive}
              onClick={() => {
                if (hasAssignedFlow) onEnableWorkflow?.();
                else onConfigure();
              }}
              data-testid="channel-enable-workflow"
            >
              {enabling ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />}
              {t("dashboard.channels.inboundRouting.useWorkflow")}
            </Button>

            <Button size="sm" variant="ghost" disabled={actionsDisabled} onClick={onConfigure}>
              {t("dashboard.channels.inboundRouting.changeSettings")}
            </Button>
          </div>
        </Can>
      </div>
    </div>
  );
}
