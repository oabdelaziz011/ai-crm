import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";
import { nestedSectionHref } from "@/lib/routing";

export const CAMPAIGNS_BASE_NESTED_PATH = "/campaigns";

export type CampaignRouteId = "list" | "create" | "detail";

export type CampaignRouteDefinition = {
  id: CampaignRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  /** Inherited parent commercial gate is `campaigns`; nested create also documents RBAC. */
  commercialFeatureCode?: string;
  Page: LazyExoticComponent<ComponentType>;
};

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

export const CAMPAIGN_ROUTE_REGISTRY: readonly CampaignRouteDefinition[] = [
  {
    id: "list",
    nestedPath: "/",
    titleKey: "campaigns.nav.list",
    permission: "campaigns.view",
    commercialFeatureCode: "campaigns",
    Page: lazyNamed(
      () => import("@/pages/dashboard/campaigns/campaign-list-page"),
      "CampaignListPage",
    ),
  },
  {
    id: "create",
    nestedPath: "/new",
    titleKey: "campaigns.nav.create",
    permission: "campaigns.create",
    commercialFeatureCode: "campaigns",
    Page: lazyNamed(
      () => import("@/pages/dashboard/campaigns/campaign-create-wizard-page"),
      "CampaignCreateWizardPage",
    ),
  },
  {
    id: "detail",
    nestedPath: "/:campaignId",
    titleKey: "campaigns.nav.detail",
    permission: "campaigns.view",
    commercialFeatureCode: "campaigns",
    Page: lazyNamed(
      () => import("@/pages/dashboard/campaigns/campaign-detail-page"),
      "CampaignDetailPage",
    ),
  },
] as const;

export function campaignCreateHref(): string {
  return nestedSectionHref("/new");
}

export function campaignDetailHref(campaignId: string): string {
  return nestedSectionHref(`/${campaignId}`);
}

export function campaignListHref(): string {
  return nestedSectionHref("/");
}
