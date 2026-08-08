import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import type { CustomerProfileQuickAction } from "@/components/customer-profile/types";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { EntityNotesPanel } from "@/components/entity-workspace/panels/entity-notes-panel";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  canEdit: boolean;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
};

/**
 * CRM notes surface — shared Entity Notes + legacy pinned customer.notes blob.
 * Notes created here appear in Operations Entity Workspace immediately (same store).
 */
export function WorkspaceNotesTab({ customer, canEdit }: Props) {
  const { t } = useTranslation("common");
  const hasPinned = Boolean(customer.notes?.trim());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <EntityNotesPanel entityType="customer" entityId={customer.id} sourceModule="crm" />

      <WorkspacePanel title={t("dashboard.customerWorkspace.notes.pinnedTitle")}>
        {hasPinned ? (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Pin className="size-3.5" />
              {t("dashboard.customerWorkspace.notes.pinnedHint")}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{customer.notes}</p>
          </div>
        ) : (
          <CustomerFieldEditor
            label={t("forms.customer.notes")}
            field="notes"
            customerId={customer.id}
            value={customer.notes ?? ""}
            multiline
            hideLabel
            canEdit={canEdit}
            forceEditing={canEdit}
          />
        )}
      </WorkspacePanel>
    </div>
  );
}
