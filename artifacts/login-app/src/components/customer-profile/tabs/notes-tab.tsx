import { useTranslation } from "react-i18next";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  canEdit: boolean;
  autoFocusNotes?: boolean;
};

export function NotesTab({ customer, canEdit, autoFocusNotes = false }: Props) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("dashboard.customerProfile.notes.hint")}</p>
      <CustomerFieldEditor
        label={t("forms.customer.notes")}
        field="notes"
        customerId={customer.id}
        value={customer.notes ?? ""}
        multiline
        hideLabel
        canEdit={canEdit}
        forceEditing={autoFocusNotes && canEdit}
      />
    </div>
  );
}
