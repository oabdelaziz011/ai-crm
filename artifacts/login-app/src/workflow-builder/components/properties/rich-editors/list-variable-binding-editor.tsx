import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NodePropertyEditorProps } from "../../../core/node-registry";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function ListVariableBindingEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-4">
      <div>
        <p className="text-sm font-semibold">{t("workflowBuilder.fields.variableBindingSection")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("workflowBuilder.fields.variableBindingHint")}</p>
      </div>
      <div className="space-y-2">
        <Label className="text-sm">{t("workflowBuilder.fields.saveSelectedValueAs")}</Label>
        <Input
          value={readString(config.saveAs)}
          onChange={(event) => onChange({ saveAs: event.target.value })}
          className="rounded-xl font-mono text-sm"
          placeholder={t("workflowBuilder.fields.saveSelectedValueAsPlaceholder")}
        />
      </div>
    </div>
  );
}
