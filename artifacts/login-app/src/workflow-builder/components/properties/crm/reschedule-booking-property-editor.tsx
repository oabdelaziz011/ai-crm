import { useTranslation } from "react-i18next";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { RESCHEDULE_BOOKING_BINDING_FIELDS } from "../../../core/crm/reschedule-booking-config";
import { FieldBindingEditor } from "../field-binding/field-binding-editor";
import type { FieldBinding } from "@workspace/automation-platform";

export function RescheduleBookingPropertyEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");

  const updateBinding = (key: string, binding: FieldBinding) => {
    onChange({ [key]: binding });
  };

  return (
    <div className="space-y-4">
      {RESCHEDULE_BOOKING_BINDING_FIELDS.map((field) => (
        <FieldBindingEditor
          key={field.key}
          label={t(`workflowBuilder.crm.rescheduleBooking.${field.labelKey}`, {
            defaultValue: field.labelKey,
          })}
          binding={config[field.key]}
          inputType={field.key === "date" ? "date" : "text"}
          document={context?.document}
          nodeId={context?.nodeId}
          onChange={(binding) => updateBinding(field.key, binding)}
        />
      ))}
    </div>
  );
}
