import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
  useCompanyOrderSettings,
  useSaveCompanyOrderSettings,
} from "@/hooks/sales/use-company-order-settings";
import { useCompanyReviewerOptions } from "@/hooks/sales/use-company-delivery-zones";
import {
  DEFAULT_COMPANY_ORDER_SETTINGS,
  type CompanyOrderSettingsFormValues,
} from "@/lib/sales-order-settings/company-order-settings";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function SalesOrderApprovalsTab({
  companyId,
  canEdit,
}: {
  companyId: string | null;
  canEdit: boolean;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data, isLoading, error } = useCompanyOrderSettings(companyId);
  const reviewers = useCompanyReviewerOptions(companyId);
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
    saveSettings.mutate(next, {
      onSuccess: () => toast({ title: t("dashboard.settings.salesOrder.saved") }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("dashboard.settings.salesOrder.saveFailed"),
          description: e.message,
        }),
    });
  });

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <div className="space-y-4" data-testid="sales-order-approvals-tab">
      <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.approvals.subtitle")}</p>
      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <form onSubmit={onSubmit} className="space-y-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={values.requireHumanApproval}
            disabled={!canEdit}
            onCheckedChange={(checked) =>
              form.setValue("requireHumanApproval", checked === true, { shouldDirty: true })
            }
          />
          <span>
            <span className="font-medium">{t("dashboard.settings.salesOrder.approvals.requireHuman")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.approvals.requireHumanHelp")}
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <Label htmlFor="default-reviewer">
            {t("dashboard.settings.salesOrder.approvals.defaultReviewer")}
          </Label>
          <select
            id="default-reviewer"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={!canEdit || reviewers.isLoading}
            value={values.defaultReviewerProfileId ?? ""}
            onChange={(e) =>
              form.setValue("defaultReviewerProfileId", e.target.value.trim() || null, {
                shouldDirty: true,
              })
            }
          >
            <option value="">{t("dashboard.settings.salesOrder.approvals.noReviewer")}</option>
            {(reviewers.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesOrder.approvals.defaultReviewerHelp")}
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={values.notifyOnPendingApproval}
            disabled={!canEdit}
            onCheckedChange={(checked) =>
              form.setValue("notifyOnPendingApproval", checked === true, { shouldDirty: true })
            }
          />
          <span>
            <span className="font-medium">{t("dashboard.settings.salesOrder.approvals.notify")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.approvals.notifyHelp")}
            </span>
          </span>
        </label>

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
