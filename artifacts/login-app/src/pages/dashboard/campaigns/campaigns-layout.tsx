import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { usePermissions } from "@/hooks/use-rbac";
import { CampaignListPage } from "@/pages/dashboard/campaigns/campaign-list-page";
import { CampaignCreateWizardPage } from "@/pages/dashboard/campaigns/campaign-create-wizard-page";
import { CampaignDetailPage } from "@/pages/dashboard/campaigns/campaign-detail-page";

function canViewCampaigns(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
  commercialFeatureEnabled: (code: string) => boolean | undefined,
): boolean {
  if (isSuperAdmin) return true;
  if (!hasPermission("campaigns.view")) return false;
  return commercialFeatureEnabled("campaigns") === true;
}

export function CampaignsLayout() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  if (!canViewCampaigns(hasPermission, isSuperAdmin, commercialFeatureEnabled)) {
    return <DashboardErrorBanner message={t("campaigns.noPermission")} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("campaigns.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("campaigns.subtitle")}</p>
      </div>

      <ModulePurposeBanner
        title={t("campaigns.purpose.title")}
        body={t("campaigns.purpose.body")}
        points={[
          t("campaigns.purpose.point1"),
          t("campaigns.purpose.point2"),
          t("campaigns.purpose.point3"),
        ]}
        stepsTitle={t("campaigns.purpose.stepsTitle")}
        steps={[
          t("campaigns.purpose.step1"),
          t("campaigns.purpose.step2"),
          t("campaigns.purpose.step3"),
          t("campaigns.purpose.step4"),
        ]}
      />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path="/new">
            <CampaignCreateWizardPage />
          </Route>
          <Route path="/:campaignId">
            <CampaignDetailPage />
          </Route>
          <Route path="/">
            <CampaignListPage />
          </Route>
        </Switch>
      </Suspense>
    </div>
  );
}

export { CampaignsLayout as CampaignsPage };
