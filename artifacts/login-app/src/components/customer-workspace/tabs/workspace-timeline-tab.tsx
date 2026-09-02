import { useTranslation } from "react-i18next";
import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";

type Props = {
  customerId: string;
  companyId?: string | null;
  /** Set when customer row cannot be scoped to the active tenant. */
  tenantError?: "missing_customer_company" | "tenant_mismatch" | null;
};

export function WorkspaceTimelineTab({ customerId, companyId, tenantError }: Props) {
  const { t } = useTranslation("common");

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.activity")}
      subtitle={t("dashboard.customerWorkspace.timeline.subtitle")}
      className="min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background p-3">
        {tenantError || !companyId ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold text-destructive">
                {t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenant")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.customerWorkspace.timeline.errors.customerNotFoundInTenantHint")}
              </p>
            </div>
          </div>
        ) : (
          <CustomerTimelinePanel
            customerId={customerId}
            companyId={companyId}
            cardVariant="workspace"
            fillHeight
          />
        )}
      </div>
    </WorkspaceTabFrame>
  );
}
