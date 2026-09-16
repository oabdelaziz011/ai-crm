import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const SMS_BASE_NESTED_PATH = "/sms";

export type SmsRouteId = "inbox";

export type SmsRouteDefinition = {
  id: SmsRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
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

export const SMS_ROUTE_REGISTRY: readonly SmsRouteDefinition[] = [
  {
    id: "inbox",
    nestedPath: "/",
    titleKey: "smsModule.nav.inbox",
    permission: "sms.view",
    commercialFeatureCode: "sms_channel",
    Page: lazyNamed(
      () => import("@/pages/dashboard/sms/sms-inbox-page"),
      "SmsInboxPage",
    ),
  },
] as const;

export const SMS_DEFAULT_NESTED_PATH = "/";

export function smsNavItems(): readonly SmsRouteDefinition[] {
  return SMS_ROUTE_REGISTRY;
}
