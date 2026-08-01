import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { RuntimeInspectorViewModel } from "../selectors/debugger-ui-selectors";

type RuntimeInspectorProps = {
  model: RuntimeInspectorViewModel;
};

export const RuntimeInspector = memo(function RuntimeInspector({ model }: RuntimeInspectorProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workflowBuilder.debugger.runtime.workflow")}
        </p>
        <DetailRow label={t("workflowBuilder.debugger.runtime.workflowState")} value={model.workflowState} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.waitingFor")} value={model.waitingFor ?? "—"} />
        <DetailRow
          label={t("workflowBuilder.debugger.runtime.pendingActions")}
          value={model.pendingActions.length > 0 ? model.pendingActions.join(", ") : "—"}
        />
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workflowBuilder.debugger.runtime.frame")}
        </p>
        <DetailRow label={t("workflowBuilder.debugger.runtime.frameId")} value={model.frameId ?? "—"} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.timestamp")} value={model.timestamp ?? "—"} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.stepNumber")} value={String(model.stepNumber ?? "—")} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.executionDepth")} value={String(model.executionDepth ?? "—")} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.branchDepth")} value={String(model.branchDepth ?? "—")} />
        <DetailRow label={t("workflowBuilder.debugger.runtime.parentFrame")} value={model.parentFrameId ?? "—"} />
      </section>

      <JsonSection title={t("workflowBuilder.debugger.runtime.executionContext")} value={model.executionContext} />
      <JsonSection title={t("workflowBuilder.debugger.runtime.outputs")} value={model.outputs} />
    </div>
  );
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate font-medium">{value}</span>
    </div>
  );
}

function JsonSection({ title, value }: { title: string; value: Record<string, unknown> }) {
  const entries = Object.entries(value);

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
  );
}
