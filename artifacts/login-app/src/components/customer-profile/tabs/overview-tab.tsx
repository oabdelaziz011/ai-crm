import { formatDistanceToNow } from "date-fns";
import {
  CalendarPlus,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerFieldEditor } from "@/components/customer-profile/fields/customer-field-editor";
import type { CustomerProfileQuickAction } from "@/components/customer-profile/types";
import { useCustomerProfileMetrics } from "@/hooks/use-customer-timeline";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Customer } from "@/lib/types";
import {
  buildGenderSelectOptions,
  genderDisplayLabel,
  normalizeGenderStorageValue,
} from "@/lib/customer-gender";

type Props = {
  customer: Customer;
  companyId?: string | null;
  canEdit: boolean;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  isQuickActionPending?: (action: CustomerProfileQuickAction) => boolean;
};

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}

function QuickActionButton({
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
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 border-white/10"
      disabled={disabled || pending}
      onClick={onClick}
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" />
      )}
      {label}
    </Button>
  );
}

export function OverviewTab({
  customer,
  companyId,
  canEdit,
  onQuickAction,
  isQuickActionPending,
}: Props) {
  const { t } = useTranslation("common");
  const canCreateBookings = useHasPermission("bookings.create");
  const canCreateInvoices = useHasPermission("invoices.create");
  const { data: metrics, isLoading: metricsLoading } = useCustomerProfileMetrics(
    customer.id,
    companyId,
  );

  const genderOptionLabels = {
    male: t("forms.customer.genderOptions.male"),
    female: t("forms.customer.genderOptions.female"),
    other: t("forms.customer.genderOptions.other"),
    preferNotToSay: t("forms.customer.genderOptions.preferNotToSay"),
  };

  const genderOptions = buildGenderSelectOptions(genderOptionLabels, customer.gender);
  const normalizedGender = normalizeGenderStorageValue(customer.gender);
  const genderLabel = genderDisplayLabel(customer.gender, genderOptionLabels);
  const notSet = t("forms.customer.notSet");
  const lastInteraction = metrics?.lastInteractionAt
    ? formatDistanceToNow(new Date(metrics.lastInteractionAt), { addSuffix: true })
    : notSet;

  const isPending = (action: CustomerProfileQuickAction) =>
    isQuickActionPending?.(action) ?? false;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-primary text-xl font-bold shrink-0">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{customer.name}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {customer.phone?.trim() || notSet}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {t("dashboard.customerProfile.quickActions.title")}
        </p>
        <div className="flex flex-wrap gap-2">
          <QuickActionButton
            icon={Phone}
            label={t("dashboard.customerProfile.quickActions.call")}
            disabled={!customer.phone?.trim()}
            pending={isPending("call")}
            onClick={() => onQuickAction("call")}
          />
          <QuickActionButton
            icon={MessageCircle}
            label={t("dashboard.customerProfile.quickActions.whatsapp")}
            disabled={!customer.phone?.trim()}
            pending={isPending("whatsapp")}
            onClick={() => onQuickAction("whatsapp")}
          />
          {canCreateBookings && (
            <QuickActionButton
              icon={CalendarPlus}
              label={t("dashboard.customerProfile.quickActions.newBooking")}
              pending={isPending("new-booking")}
              onClick={() => onQuickAction("new-booking")}
            />
          )}
          {canCreateInvoices && (
            <QuickActionButton
              icon={FileText}
              label={t("dashboard.customerProfile.quickActions.newInvoice")}
              pending={isPending("new-invoice")}
              onClick={() => onQuickAction("new-invoice")}
            />
          )}
          <QuickActionButton
            icon={StickyNote}
            label={t("dashboard.customerProfile.quickActions.addNote")}
            pending={isPending("add-note")}
            onClick={() => onQuickAction("add-note")}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {t("dashboard.customerProfile.metrics.title")}
        </p>
        {metricsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            <MetricCard
              label={t("dashboard.customerProfile.metrics.bookings")}
              value={String(metrics?.bookingsCount ?? 0)}
            />
            <MetricCard
              label={t("dashboard.customerProfile.metrics.invoices")}
              value={String(metrics?.invoicesCount ?? 0)}
            />
            <MetricCard
              label={t("dashboard.customerProfile.metrics.lastInteraction")}
              value={lastInteraction}
            />
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {t("dashboard.customerProfile.sections.contactDetails")}
        </p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <CustomerFieldEditor
            label={t("forms.customer.fullName")}
            field="name"
            customerId={customer.id}
            value={customer.name}
            canEdit={canEdit}
          />
          <CustomerFieldEditor
            label={t("forms.customer.phone")}
            field="phone"
            customerId={customer.id}
            value={customer.phone ?? ""}
            inputType="tel"
            canEdit={canEdit}
          />
          <CustomerFieldEditor
            label={t("forms.customer.email")}
            field="email"
            customerId={customer.id}
            value={customer.email ?? ""}
            inputType="email"
            canEdit={canEdit}
          />
          <CustomerFieldEditor
            label={t("forms.customer.gender")}
            field="gender"
            customerId={customer.id}
            value={normalizedGender}
            displayValue={genderLabel}
            selectOptions={genderOptions}
            canEdit={canEdit}
          />
          <CustomerFieldEditor
            label={t("forms.customer.age")}
            field="age"
            customerId={customer.id}
            value={customer.age == null ? "" : String(customer.age)}
            inputType="number"
            canEdit={canEdit}
          />
          <InfoCell label={t("dashboard.customerDetails.fields.status")} value={notSet} />
        </div>
      </div>
    </div>
  );
}
