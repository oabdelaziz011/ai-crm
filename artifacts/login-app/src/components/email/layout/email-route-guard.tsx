import AccessDeniedPage from "@/pages/access-denied";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import type { EmailRouteDefinition } from "@/config/email-route-registry";

type Props = {
  route: EmailRouteDefinition;
  Page: EmailRouteDefinition["Page"];
};

export function EmailRouteGuard({ route, Page }: Props) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();

  if (route.commercialFeatureCode) {
    if (commercialFeatureEnabled(route.commercialFeatureCode) !== true) {
      return (
        <AccessDeniedPage requiredPermission={route.commercialFeatureCode} />
      );
    }
  }

  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return <AccessDeniedPage requiredPermission={route.permission} />;
  }

  return <Page />;
}
