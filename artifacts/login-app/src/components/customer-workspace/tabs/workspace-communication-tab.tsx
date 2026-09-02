import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import type { CustomerProfileQuickAction } from "@/components/customer-profile/types";
import { EntityNotesPanel } from "@/components/entity-workspace/panels/entity-notes-panel";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";
import type { Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  companyId?: string | null;
  canEdit: boolean;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  isActionPending?: (action: CustomerProfileQuickAction) => boolean;
  canWhatsapp?: boolean;
};

export function WorkspaceCommunicationTab({
  customer,
  canEdit,
  onQuickAction,
  isActionPending,
  canWhatsapp = false,
}: Props) {
  const { t } = useTranslation("common");
  const pending = (action: CustomerProfileQuickAction) => isActionPending?.(action) ?? false;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.communication")}
      subtitle={t("dashboard.customerWorkspace.communication.channels")}
    >
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ChannelButton
            icon={MessageCircle}
            label="WhatsApp"
            disabled={!canWhatsapp || !customer.phone?.trim()}
            pending={pending("whatsapp")}
            onClick={() => onQuickAction("whatsapp")}
          />
          <ChannelButton
            icon={Mail}
            label={t("dashboard.customerWorkspace.communication.email")}
            disabled={!customer.email?.trim()}
            onClick={() => customer.email && window.open(`mailto:${customer.email}`, "_self")}
          />
          <ChannelButton
            icon={Phone}
            label={t("dashboard.customerWorkspace.communication.sms")}
            disabled={!customer.phone?.trim()}
            onClick={() => onQuickAction("call")}
          />
          <ChannelButton
            icon={Phone}
            label={t("dashboard.customerWorkspace.communication.calls")}
            disabled={!customer.phone?.trim()}
            pending={pending("call")}
            onClick={() => onQuickAction("call")}
          />
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-3">
          <p className="mb-2 text-xs font-semibold">{t("dashboard.customerWorkspace.notes.pinnedTitle")}</p>
          <CustomerFieldEditor
            label={t("forms.customer.notes")}
            field="notes"
            customerId={customer.id}
            value={customer.notes ?? ""}
            multiline
            hideLabel
            canEdit={canEdit}
          />
        </section>

        <section className="rounded-xl border border-border/60 bg-background p-3">
          <EntityNotesPanel entityType="customer" entityId={customer.id} sourceModule="crm" dense />
        </section>
      </div>
    </WorkspaceTabFrame>
  );
}

function ChannelButton({
  icon: Icon,
  label,
  disabled,
  pending,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto flex-col gap-1.5 rounded-xl border-border/60 bg-background py-3"
      disabled={disabled || pending}
      onClick={onClick}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4 text-primary" />}
      <span className="text-[11px] font-medium">{label}</span>
    </Button>
  );
}
