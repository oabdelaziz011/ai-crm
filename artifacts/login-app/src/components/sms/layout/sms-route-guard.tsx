import AccessDeniedPage from "@/pages/access-denied";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import type { SmsRouteDefinition } from "@/config/sms-route-registry";

type Props = {
  route: SmsRouteDefinition;
  Page: SmsRouteDefinition["Page"];
};

export function SmsRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  if (route.commercialFeatureCode && !isSuperAdmin) {
    if (commercialFeatureEnabled(route.commercialFeatureCode) !== true) {
      return <AccessDeniedPage requiredPermission={route.commercialFeatureCode} />;
    }
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <AccessDeniedPage requiredPermission={route.permission} />;
  }

  return <Page />;
}
