import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NodePropertyEditorProps } from "../../../core/node-registry";

export function PrimaryMenuToggle({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const enabled = config.primaryMenu === true;

  const handleChange = (checked: boolean) => {
    if (checked && context) {
      const patches = context.document.nodes
        .filter(
          (node) =>
            (node.type === "buttons" || node.type === "list") &&
            node.id !== context.nodeId &&
            node.config.primaryMenu === true,
        )
        .map((node) => ({ nodeId: node.id, patch: { primaryMenu: false } }));
      if (patches.length > 0) {
        context.applyConfigPatches(patches);
      }
    }
    onChange({ primaryMenu: checked });
  };

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/50 p-4">
      <div className="space-y-1">
        <Label htmlFor="primary-menu-toggle" className="text-sm font-semibold">
          {t("workflowBuilder.primaryMenu.label")}
        </Label>
        <p className="text-xs text-muted-foreground">{t("workflowBuilder.primaryMenu.help")}</p>
      </div>
      <Switch id="primary-menu-toggle" checked={enabled} onCheckedChange={handleChange} />
    </div>
  );
}
