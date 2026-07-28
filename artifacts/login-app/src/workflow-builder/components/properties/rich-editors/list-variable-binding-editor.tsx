import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { readListDataSourceMode } from "../../../core/conversation/list-node-config";
import {
  getLookupEntityDefinition,
  isLookupEntityId,
  resolveLookupOutputVariableName,
} from "@/lib/lookups";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function ListVariableBindingEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const mode = readListDataSourceMode(config);
  const lookup = readString(config.lookup);
  const definition = isLookupEntityId(lookup) ? getLookupEntityDefinition(lookup) : null;
  const outputVariable = resolveLookupOutputVariableName(config);

  if (mode === "lookup" && definition) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-4">
        <div>
          <p className="text-sm font-semibold">{t("workflowBuilder.fields.variableBindingSection")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("workflowBuilder.fields.lookupOutputVariableHint")}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.fields.lookupOutputVariable")}</Label>
          <Input
            value={outputVariable ?? definition.variableName}
            readOnly
            className="rounded-xl bg-muted/40 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t(definition.displayNameKey, { defaultValue: definition.variableName })}
          </p>
        </div>
        <div className="space-y-1 rounded-xl border border-border/40 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("workflowBuilder.fields.lookupOutputFields")}
          </p>
          <ul className="space-y-1 text-xs text-foreground">
            {definition.outputFields.map((field) => (
              <li key={field.id} className="font-mono">
                {`{{${definition.variableName}.${field.id}}}`}
                <span className="ms-2 font-sans text-muted-foreground">
                  {t(field.labelKey, { defaultValue: field.id })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

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
          onChange={(event) => onChange({ saveAs: event.target.value, inputKey: event.target.value })}
          className="rounded-xl font-mono text-sm"
          placeholder={t("workflowBuilder.fields.saveSelectedValueAsPlaceholder")}
        />
      </div>
    </div>
  );
}
