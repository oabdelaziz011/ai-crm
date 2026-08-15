import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FieldBinding } from "@workspace/automation-platform";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { normalizeFindTicketNodeConfig } from "../../../core/crm/find-ticket-config";
import { FieldBindingEditor } from "../field-binding/field-binding-editor";

export function FindTicketPropertyEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const normalized = useMemo(() => normalizeFindTicketNodeConfig(config), [config]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("workflowBuilder.crm.findTicket.hint")}</p>
      <FieldBindingEditor
        label={t("workflowBuilder.crm.findTicket.ticketNumber")}
        binding={normalized.ticketNumber}
        inputType="text"
        placeholder={t("workflowBuilder.crm.findTicket.ticketNumberPlaceholder")}
        document={context?.document}
        nodeId={context?.nodeId}
        onChange={(binding: FieldBinding) => onChange({ ticketNumber: binding })}
      />
    </div>
  );
}
