import { Mail, Phone, Pencil, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BillingContact } from "@/lib/billing/types";
import { DashboardCard } from "@/components/dashboard/ui";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { Button } from "@/components/ui/button";

type BillingContactPanelProps = {
  contact?: BillingContact | null;
  loading?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
};

export function BillingContactPanel({ contact, loading, canEdit, onEdit }: BillingContactPanelProps) {
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <DashboardCard className="p-5 space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
      </DashboardCard>
    );
  }

  if (!contact) {
    return (
      <DashboardCard className="overflow-hidden">
        <BillingEmptyState
          title={t("billing.detail.noBillingContact")}
          description={t("billing.detail.noBillingContactHint")}
          icon={User}
        />
        {canEdit && onEdit ? (
          <div className="border-t border-white/5 p-4">
            <Button size="sm" variant="outline" onClick={onEdit}>
              {t("billing.edit.addContact")}
            </Button>
          </div>
        ) : null}
      </DashboardCard>
    );
  }

  return (
    <DashboardCard className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("billing.detail.billingContact")}</p>
          <p className="mt-2 text-lg font-semibold">{contact.name}</p>
        </div>
        {canEdit && onEdit ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("billing.edit.editContact")}
          </Button>
        ) : null}
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{contact.email}</span>
        </div>
        {contact.phone ? (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{contact.phone}</span>
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );
}
