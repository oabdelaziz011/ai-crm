import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  findWorkflowVariable,
  findWorkflowVariableByField,
  type WorkflowVariable,
} from "../../../core/variables/variable-provider-registry";
import { listDocumentWorkflowVariables, findDocumentWorkflowVariableByField } from "../../../core/variables/document-workflow-variable-provider";
import type { WorkflowDocument } from "../../../core/types";
import {
  isFieldBinding,
  normalizeFieldBinding,
  staticBinding,
  variableBinding,
  type FieldBinding,
} from "@workspace/automation-platform";
import { VariablePicker } from "../../variables/variable-picker";

export type FieldBindingInputType = "text" | "textarea" | "date" | "time" | "number";

type FieldBindingEditorProps = {
  label: string;
  binding: unknown;
  onChange: (binding: FieldBinding) => void;
  optional?: boolean;
  inputType?: FieldBindingInputType;
  placeholder?: string;
  document?: WorkflowDocument;
  nodeId?: string;
};

function emptyBinding(): FieldBinding {
  return staticBinding("");
}

function resolveVariableLabel(
  variable: string,
  extraVariables: WorkflowVariable[],
  translate: (key: string, fallback: string) => string,
  document?: WorkflowDocument,
  nodeId?: string,
): string {
  const token = variable.startsWith("{{") ? variable : `{{${variable}}}`;
  const matched =
    findWorkflowVariable(token) ??
    findWorkflowVariableByField(variable, extraVariables) ??
    (document && nodeId ? findDocumentWorkflowVariableByField(document, nodeId, variable) : undefined) ??
    extraVariables.find((entry) => entry.token === token || entry.label === variable);

  if (matched?.labelKey) {
    return translate(matched.labelKey, matched.label);
  }

  return matched?.label ?? variable;
}

export function FieldBindingEditor({
  label,
  binding,
  onChange,
  optional = false,
  inputType = "text",
  placeholder,
  document,
  nodeId,
}: FieldBindingEditorProps) {
  const { t } = useTranslation("common");
  const normalized = normalizeFieldBinding(binding, emptyBinding());
  const mode = normalized.mode === "variable" ? "variable" : "static";

  const documentVariables = useMemo(() => {
    if (!document || !nodeId) return [];
    return listDocumentWorkflowVariables(document, nodeId);
  }, [document, nodeId]);

  const variableLabel =
    normalized.mode === "variable"
      ? resolveVariableLabel(
          normalized.variable,
          documentVariables,
          (key, fallback) => t(key, { defaultValue: fallback }),
          document,
          nodeId,
        )
      : null;

  const setMode = (nextMode: string) => {
    if (nextMode === "variable") {
      onChange(variableBinding(normalized.mode === "variable" ? normalized.variable : ""));
      return;
    }
    onChange(staticBinding(normalized.mode === "static" ? normalized.value : ""));
  };

  const staticValue = normalized.mode === "static" ? normalized.value : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">
          {label}
          {optional ? (
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t("workflowBuilder.fieldBinding.optional")}
            </span>
          ) : null}
        </Label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value);
          }}
          className="rounded-xl border border-border/60 bg-background/50 p-0.5"
        >
          <ToggleGroupItem value="static" className="rounded-lg px-3 text-xs">
            {t("workflowBuilder.fieldBinding.static")}
          </ToggleGroupItem>
          <ToggleGroupItem value="variable" className="rounded-lg px-3 text-xs">
            {t("workflowBuilder.fieldBinding.variable")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === "static" ? (
        inputType === "textarea" ? (
          <Textarea
            value={staticValue}
            placeholder={placeholder}
            rows={3}
            onChange={(event) => onChange(staticBinding(event.target.value))}
            className="min-h-20 resize-y rounded-xl bg-background/80"
          />
        ) : (
          <Input
            value={staticValue}
            type={inputType === "number" ? "number" : inputType === "date" ? "date" : inputType === "time" ? "time" : "text"}
            placeholder={placeholder}
            onChange={(event) => onChange(staticBinding(event.target.value))}
            className="rounded-xl bg-background/80"
          />
        )
      ) : (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              {variableLabel && normalized.mode === "variable" && normalized.variable.trim()
                ? variableLabel
                : t("workflowBuilder.fieldBinding.selectVariable")}
            </p>
            <VariablePicker
              document={document}
              nodeId={nodeId}
              onSelect={(variable) => onChange(variableBinding(variable.token))}
            />
          </div>
          {normalized.mode === "variable" && normalized.variable.trim() ? (
            <p className="text-xs text-muted-foreground">{normalized.variable}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function isEmptyBinding(binding: unknown): boolean {
  if (!isFieldBinding(binding)) return true;
  if (binding.mode === "static") return binding.value.trim().length === 0;
  if (binding.mode === "variable") return binding.variable.trim().length === 0;
  return true;
}
