import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";
import type { CustomerProfileQuickAction } from "@/components/customer-profile/types";
import { WorkspaceSection } from "@/components/customer-workspace/workspace-ui";
import { EntityNotesPanel } from "@/components/entity-workspace/panels/entity-notes-panel";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  companyId?: string | null;
  canEdit: boolean;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  isActionPending?: (action: CustomerProfileQuickAction) => boolean;
};

export function WorkspaceCommunicationTab({
  customer,
  companyId,
  canEdit,
  onQuickAction,
  isActionPending,
}: Props) {
  const { t } = useTranslation("common");
  const pending = (action: CustomerProfileQuickAction) => isActionPending?.(action) ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-in fade-in duration-300">
      <WorkspaceSection title={t("dashboard.customerWorkspace.communication.channels")} dense>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <ChannelButton icon={MessageCircle} label="WhatsApp" disabled={!customer.phone?.trim()} pending={pending("whatsapp")} onClick={() => onQuickAction("whatsapp")} />
          <ChannelButton icon={Mail} label={t("dashboard.customerWorkspace.communication.email")} disabled={!customer.email?.trim()} onClick={() => customer.email && window.open(`mailto:${customer.email}`, "_self")} />
          <ChannelButton icon={Phone} label={t("dashboard.customerWorkspace.communication.sms")} disabled={!customer.phone?.trim()} onClick={() => onQuickAction("call")} />
          <ChannelButton icon={Phone} label={t("dashboard.customerWorkspace.communication.calls")} disabled={!customer.phone?.trim()} pending={pending("call")} onClick={() => onQuickAction("call")} />
        </div>
      </WorkspaceSection>

      <EntityNotesPanel entityType="customer" entityId={customer.id} sourceModule="crm" dense />

      <WorkspaceSection title={t("dashboard.customerWorkspace.notes.pinnedTitle")} dense>
        <CustomerFieldEditor
          label={t("forms.customer.notes")}
          field="notes"
          customerId={customer.id}
          value={customer.notes ?? ""}
          multiline
          hideLabel
          canEdit={canEdit}
        />
      </WorkspaceSection>

      <WorkspaceSection title={t("dashboard.customerWorkspace.communication.history")} subtitle={t("dashboard.customerWorkspace.communication.historySubtitle")} dense>
        <CustomerTimelinePanel customerId={customer.id} companyId={companyId} cardVariant="workspace" />
      </WorkspaceSection>
    </div>
  );
}

function ChannelButton({ icon: Icon, label, disabled, pending, onClick }: { icon: typeof Phone; label: string; disabled?: boolean; pending?: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-auto flex-col gap-1.5 py-3" disabled={disabled || pending} onClick={onClick}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4 text-primary" />}
      <span className="text-[11px] font-medium">{label}</span>
    </Button>
  );
}
