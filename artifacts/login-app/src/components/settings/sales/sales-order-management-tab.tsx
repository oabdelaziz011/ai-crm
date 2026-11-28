import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
  useCompanyOrderSettings,
  useSaveCompanyOrderSettings,
} from "@/hooks/sales/use-company-order-settings";
import {
  DEFAULT_COMPANY_ORDER_SETTINGS,
  type CompanyOrderSettingsFormValues,
  type OrderRequiredFields,
} from "@/lib/sales-order-settings/company-order-settings";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const REQUIRED_FIELD_KEYS: Array<keyof OrderRequiredFields> = [
  "customerName",
  "mobileNumber",
  "governorate",
  "cityArea",
  "detailedAddress",
  "deliveryNotes",
  "deliveryLocation",
  "secondaryPhone",
];

export function SalesOrderManagementTab({
  companyId,
  canEdit,
}: {
  companyId: string | null;
  canEdit: boolean;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data, isLoading, error } = useCompanyOrderSettings(companyId);
  const saveSettings = useSaveCompanyOrderSettings(companyId);
  const form = useForm<CompanyOrderSettingsFormValues>({
    defaultValues: { ...DEFAULT_COMPANY_ORDER_SETTINGS },
  });

  useEffect(() => {
    if (data) form.reset(data.form);
  }, [data, form]);

  const values = form.watch();

  const onSubmit = form.handleSubmit((next) => {
    if (!canEdit) return;
    saveSettings.mutate(
      {
        ...next,
        paymentMethods: ["cash_on_delivery"],
      },
      {
        onSuccess: () => toast({ title: t("dashboard.settings.salesOrder.saved") }),
        onError: (e) =>
          toast({
            variant: "destructive",
            title: t("dashboard.settings.salesOrder.saveFailed"),
            description: e.message,
          }),
      },
    );
  });

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <div className="space-y-4" data-testid="sales-order-management-tab">
      <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.orders.subtitle")}</p>
      {error ? <DashboardErrorBanner message={error.message} /> : null}
      {data?.configState === "unconfigured" ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("dashboard.settings.salesOrder.unconfiguredHint")}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={values.aiOrderCollectionEnabled}
            disabled={!canEdit}
            onCheckedChange={(checked) =>
              form.setValue("aiOrderCollectionEnabled", checked === true, { shouldDirty: true })
            }
          />
          <span>
            <span className="font-medium">{t("dashboard.settings.salesOrder.orders.aiEnabled")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.orders.aiEnabledHelp")}
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <Label>{t("dashboard.settings.salesOrder.orders.paymentMethods")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesOrder.orders.paymentMethodsHelp")}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked disabled={!canEdit} />
            {t("dashboard.settings.salesOrder.orders.payment.cash_on_delivery")}
          </label>
        </div>

        <div className="space-y-2">
          <Label>{t("dashboard.settings.salesOrder.orders.requiredFields")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesOrder.orders.requiredFieldsHelp")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REQUIRED_FIELD_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.requiredFields[key]}
                  disabled={!canEdit}
                  onCheckedChange={(checked) =>
                    form.setValue(
                      "requiredFields",
                      { ...values.requiredFields, [key]: checked === true },
                      { shouldDirty: true },
                    )
                  }
                />
                {t(`dashboard.settings.salesOrder.orders.fields.${key}`)}
              </label>
            ))}
          </div>
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.readOnly")}</p>
        ) : null}

        <Button type="submit" disabled={!canEdit || saveSettings.isPending}>
          {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("dashboard.settings.salesOrder.save")}
        </Button>
      </form>
    </div>
  );
}
