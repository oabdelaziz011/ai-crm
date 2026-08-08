import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OperationWidgetContext, OperationWorkspaceTabId } from "@/lib/universal-operations/widget-registry";
import { getOperationWidgetRegistry } from "@/lib/universal-operations/widget-registry";
import { ComingSoonBanner } from "./widgets/shared";

export function OperationWidgetRenderer({
  tab,
  ctx,
}: {
  tab: OperationWorkspaceTabId;
  ctx: OperationWidgetContext;
}) {
  const { t } = useTranslation("common");
  const widgets = useMemo(
    () => getOperationWidgetRegistry().getWidgetsForTab(tab, ctx, t),
    [tab, ctx, t],
  );

  if (!widgets.length) {
    return <ComingSoonBanner label={t("universalOperations.workspace.empty.widgets")} />;
  }

  return (
    <div className="space-y-3">
      {widgets.map((widget) => {
        const Component = widget.Component;
        return (
          <div key={widget.id} data-widget-id={widget.id} data-module={widget.module}>
            <Component ctx={ctx} />
          </div>
        );
      })}
    </div>
  );
}
