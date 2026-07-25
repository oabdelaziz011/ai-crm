import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ValidationFixAction, ValidationIssue } from "../../core/types";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";

type WorkflowValidationPanelProps = {
  controller: WorkflowBuilderController;
};

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === "error" ? -1 : 1;
    }
    return left.message.localeCompare(right.message);
  });
}

function FixActionButtons({
  actions,
  resolveFixLabel,
}: {
  actions: ValidationFixAction[];
  resolveFixLabel: (action: ValidationFixAction) => string;
}) {
  const { t } = useTranslation("common");

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("workflowBuilder.validationPanel.suggestedFix")}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="outline"
            disabled
            className="h-8 rounded-lg text-xs"
            title={t("workflowBuilder.validationPanel.fixActions.comingSoon")}
          >
            {resolveFixLabel(action)}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("workflowBuilder.validationPanel.fixActions.comingSoon")}</p>
    </div>
  );
}

export function WorkflowValidationPanel({ controller }: WorkflowValidationPanelProps) {
  const { t } = useTranslation("common");
  const { validationMessage, validationFixActionLabel } = useWorkflowBuilderI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const issues = useMemo(
    () => sortIssues(controller.state.validationIssues),
    [controller.state.validationIssues],
  );
  const activeIssueId = controller.state.activeValidationIssueId;
  const activeIndex = issues.findIndex((issue) => issue.id === activeIssueId);

  useEffect(() => {
    if (issues.length === 0) {
      if (activeIssueId) controller.dispatch({ type: "SET_ACTIVE_VALIDATION_ISSUE", issueId: null });
      return;
    }
    if (activeIssueId && issues.some((issue) => issue.id === activeIssueId)) return;
    controller.dispatch({ type: "SET_ACTIVE_VALIDATION_ISSUE", issueId: issues[0]!.id });
  }, [activeIssueId, controller, issues]);

  useEffect(() => {
    if (controller.state.validationPanelFocusNonce === 0) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [controller.state.validationPanelFocusNonce]);

  if (issues.length === 0) {
    return (
      <div
        ref={panelRef}
        id="workflow-validation-panel"
        className="shrink-0 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
      >
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          {t("workflowBuilder.validationPanel.allClear")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("workflowBuilder.validationPanel.allClearHint")}</p>
      </div>
    );
  }

  const navigateIssue = (direction: -1 | 1) => {
    if (issues.length === 0) return;
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = (currentIndex + direction + issues.length) % issues.length;
    const nextIssue = issues[nextIndex]!;
    controller.dispatch({ type: "SET_ACTIVE_VALIDATION_ISSUE", issueId: nextIssue.id });
    controller.focusValidationIssue(nextIssue);
  };

  const handleIssueClick = (issue: ValidationIssue) => {
    controller.dispatch({ type: "SET_ACTIVE_VALIDATION_ISSUE", issueId: issue.id });
    controller.focusValidationIssue(issue);
  };

  const currentIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <div
      ref={panelRef}
      id="workflow-validation-panel"
      className="shrink-0 rounded-2xl border border-border/60 bg-background/70 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t("workflowBuilder.validationPanel.title")}</p>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {t("workflowBuilder.validationPanel.errorCount", {
              current: currentIndex + 1,
              total: issues.length,
            })}
          </span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => navigateIssue(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => navigateIssue(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {issues.map((issue) => {
          const isActive = issue.id === (activeIssueId ?? issues[0]?.id);
          const Icon = issue.severity === "error" ? AlertCircle : AlertTriangle;

          return (
            <div
              key={issue.id}
              className={`rounded-xl border p-3 transition-colors ${
                isActive
                  ? issue.severity === "error"
                    ? "border-red-500/50 bg-red-500/10 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]"
                    : "border-amber-500/50 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"
                  : "border-border/60 bg-background/80"
              }`}
            >
              <button type="button" onClick={() => handleIssueClick(issue)} className="w-full text-start">
                <div className="flex items-start gap-2">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      issue.severity === "error" ? "text-red-500" : "text-amber-500"
                    }`}
                  />
                  <p className="text-sm font-medium leading-snug">{validationMessage(issue)}</p>
                </div>
              </button>
              <div className="mt-3 ps-6">
                <FixActionButtons
                  actions={issue.fixActions ?? []}
                  resolveFixLabel={validationFixActionLabel}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
