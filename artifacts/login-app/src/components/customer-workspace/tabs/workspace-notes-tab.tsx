import { AtSign, Pin, StickyNote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import type { CustomerProfileQuickAction } from "@/components/customer-profile/types";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  canEdit: boolean;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
};

export function WorkspaceNotesTab({ customer, canEdit }: Props) {
  const { t } = useTranslation("common");
  const hasNotes = Boolean(customer.notes?.trim());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <WorkspacePanel title={t("dashboard.customerWorkspace.notes.pinnedTitle")}>
        {hasNotes ? (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Pin className="size-3.5" />
              {t("dashboard.customerWorkspace.notes.pinnedHint")}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{customer.notes}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("dashboard.customerWorkspace.notes.noPinned")}</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        title={t("dashboard.customerWorkspace.notes.internalTitle")}
        subtitle={t("dashboard.customerProfile.notes.hint")}
      >
        <CustomerFieldEditor
          label={t("forms.customer.notes")}
          field="notes"
          customerId={customer.id}
          value={customer.notes ?? ""}
          multiline
          hideLabel
          canEdit={canEdit}
          forceEditing={!hasNotes && canEdit}
        />
      </WorkspacePanel>

      <WorkspacePanel title={t("dashboard.customerWorkspace.notes.mentionsTitle")}>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-12 text-center">
          <AtSign className="size-8 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium">{t("dashboard.customerWorkspace.notes.noMentions")}</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {t("dashboard.customerWorkspace.notes.mentionsHint")}
          </p>
        </div>
      </WorkspacePanel>

      {!hasNotes && canEdit && (
        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <StickyNote className="size-3.5" />
          {t("dashboard.customerWorkspace.notes.emptyHint")}
        </p>
      )}
    </div>
  );
}
