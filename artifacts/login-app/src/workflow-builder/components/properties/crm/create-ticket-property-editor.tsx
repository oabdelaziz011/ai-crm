import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FieldBinding } from "@workspace/automation-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import {
  CREATE_TICKET_BINDING_FIELDS,
  normalizeCreateTicketNodeConfig,
} from "../../../core/crm/create-ticket-config";
import { FieldBindingEditor } from "../field-binding/field-binding-editor";

export function CreateTicketPropertyEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const normalized = useMemo(() => normalizeCreateTicketNodeConfig(config), [config]);

  const updateBinding = (key: string, binding: FieldBinding) => {
    onChange({ [key]: binding });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("workflowBuilder.crm.createTicket.hint")}</p>
      <p className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        {t("workflowBuilder.crm.createTicket.outputHint")}
      </p>
      {CREATE_TICKET_BINDING_FIELDS.map((field) => (
        <FieldBindingEditor
          key={field.key}
          label={t(`workflowBuilder.crm.createTicket.${field.labelKey}`, {
            defaultValue: field.labelKey,
          })}
          binding={normalized[field.key]}
          optional={field.optional}
          inputType={field.inputType}
          placeholder={
            field.key === "priority"
              ? t("workflowBuilder.crm.createTicket.priorityPlaceholder")
              : field.key === "customer"
                ? t("workflowBuilder.crm.createTicket.customerPlaceholder")
                : undefined
          }
          document={context?.document}
          nodeId={context?.nodeId}
          onChange={(binding) => updateBinding(field.key, binding)}
        />
      ))}
    </div>
  );
}
