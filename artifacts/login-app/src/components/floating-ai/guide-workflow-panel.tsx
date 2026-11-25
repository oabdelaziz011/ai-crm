import { memo } from "react";
import { ArrowLeft, Check, Compass, Info, ShieldAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  getGuideWorkflowStep,
  guideWorkflowTitleKey,
  isGuideWorkflowLive,
  type GuideWorkflowState,
} from "@/lib/floating-ai/guide/guide-workflow-runtime";

type GuideWorkflowPanelProps = {
  state: GuideWorkflowState;
  onConfirm: () => void;
  onCancel: () => void;
  onBack?: () => void;
  /** Dismiss a finished / cancelled / denied banner. */
  onDismiss?: () => void;
};

/**
 * Tool-less Guide workflow card. Guide only opens pages and asks the user to
 * confirm; every create / update happens in the product UI by the user.
 */
export const GuideWorkflowPanel = memo(function GuideWorkflowPanel({
  state,
  onConfirm,
  onCancel,
  onBack,
  onDismiss,
}: GuideWorkflowPanelProps) {
  const { t } = useTranslation("common");
  const resolved = getGuideWorkflowStep(state);
  const total = resolved?.workflow.steps.length ?? 0;
  const title = t(guideWorkflowTitleKey(state.workflowId));

  if (state.status === "denied") {
    return (
      <div
        role="alert"
        data-testid="guide-workflow-panel"
        data-status="denied"
        className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs"
      >
        <div className="flex items-start gap-2 text-destructive">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-semibold">{title}</p>
            <p>{t("floatingAi.guide.workflow.denied")}</p>
          </div>
          {onDismiss ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={onDismiss}
              aria-label={t("floatingAi.guide.workflow.dismiss")}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (state.status === "completed" || state.status === "cancelled") {
    const completed = state.status === "completed";
    return (
      <div
        role="status"
        data-testid="guide-workflow-panel"
        data-status={state.status}
        className="shrink-0 border-t border-border bg-muted/40 px-3 py-2.5 text-xs"
      >
        <div className="flex items-start gap-2">
          <Compass className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-semibold">{title}</p>
            <p className="text-muted-foreground">
              {completed
                ? t("floatingAi.guide.workflow.completed")
                : t("floatingAi.guide.workflow.cancelled")}
            </p>
            {completed ? (
              <p className="text-[10px] text-muted-foreground">
                {t("floatingAi.guide.workflow.noWriteClaim")}
              </p>
            ) : null}
          </div>
          {onDismiss ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={onDismiss}
              aria-label={t("floatingAi.guide.workflow.dismiss")}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!resolved || !isGuideWorkflowLive(state)) return null;

  const { step } = resolved;
  const isLast = state.stepIndex >= total - 1;
  const confirmLabel =
    step.awaitUserConfirmation && !isLast
      ? t("floatingAi.guide.workflow.confirm")
      : t("floatingAi.guide.workflow.done");

  return (
    <section
      data-testid="guide-workflow-panel"
      data-status={state.status}
      aria-label={title}
      className="shrink-0 space-y-2 border-t border-primary/20 bg-primary/5 px-3 py-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Compass className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="truncate font-semibold">{title}</p>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {t("floatingAi.guide.workflow.progress", { current: state.stepIndex + 1, total })}
        </span>
      </div>

      <p className="leading-relaxed text-foreground" data-testid="guide-workflow-instruction">
        {t(step.instructionKey)}
      </p>

      {step.navigateRouteId ? (
        <p
          className="flex items-start gap-1.5 rounded-md border border-border bg-background/70 px-2 py-1.5 text-[10px] text-muted-foreground"
          data-testid="guide-workflow-navigate-hint"
        >
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>{t("floatingAi.guide.workflow.navigateHint")}</span>
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={onConfirm}>
            <Check className="size-3" aria-hidden="true" />
            {confirmLabel}
          </Button>
          {onBack && state.stepIndex > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={onBack}
            >
              <ArrowLeft className="size-3 rtl:rotate-180" aria-hidden="true" />
              {t("floatingAi.guide.workflow.back")}
            </Button>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          {t("floatingAi.guide.workflow.cancel")}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {t("floatingAi.guide.workflow.noWriteClaim")}
      </p>
    </section>
  );
});
