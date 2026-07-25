import { Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { NodePropertyEditorContext } from "../../../core/node-registry";

export function GenerateRoutingAction({ context }: { context?: NodePropertyEditorContext }) {
  const { t } = useTranslation("common");
  if (!context?.generateInteractiveRouting) return null;

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">{t("workflowBuilder.routing.title")}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("workflowBuilder.routing.description")}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3 rounded-xl"
        onClick={() => context.generateInteractiveRouting?.()}
      >
        <Route className="me-2 h-4 w-4" />
        {t("workflowBuilder.routing.generate")}
      </Button>
    </div>
  );
}
