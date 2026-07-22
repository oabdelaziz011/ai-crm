import { useTranslation } from "react-i18next";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { CREATE_BOOKING_BINDING_FIELDS } from "../../../core/crm/create-booking-config";
import { FieldBindingEditor } from "../field-binding/field-binding-editor";
import type { FieldBinding } from "@workspace/automation-platform";

export function CreateBookingPropertyEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");

  const updateBinding = (key: string, binding: FieldBinding) => {
    onChange({ [key]: binding });
  };

  return (
    <div className="space-y-4">
      {CREATE_BOOKING_BINDING_FIELDS.map((field) => (
        <FieldBindingEditor
          key={field.key}
          label={t(`workflowBuilder.crm.createBooking.${field.labelKey}`, {
            defaultValue: field.labelKey,
          })}
          binding={config[field.key]}
          optional={field.optional}
          inputType={field.inputType}
          document={context?.document}
          nodeId={context?.nodeId}
          onChange={(binding) => updateBinding(field.key, binding)}
        />
      ))}
    </div>
  );
}
