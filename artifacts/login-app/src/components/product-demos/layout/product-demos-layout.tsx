import { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  PRODUCT_DEMOS_DEFAULT_NESTED_PATH,
  PRODUCT_DEMOS_ROUTE_REGISTRY,
} from "@/config/product-demos-route-registry";
import { ProductDemosSubNav } from "@/components/product-demos/layout/product-demos-sub-nav";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { ModulePageHeader } from "@/components/dashboard/module-page-header";
import { useAuthUser } from "@/hooks/use-rbac";
import { NEST_INDEX } from "@/lib/routing";

function GuardedProductDemosRoute({
  route,
}: {
  route: (typeof PRODUCT_DEMOS_ROUTE_REGISTRY)[number];
}) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return (
        <p className="text-sm text-muted-foreground">{t("productDemos.permissionDenied")}</p>
    );
  }
  const Page = route.Page;
  return <Page />;
}

export function ProductDemosLayout() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = isSuperAdmin || hasPermission("product_demos.view");

  if (!canView) {
    return (
      <div className="space-y-4">
        <ModulePageHeader title={t("navigation.productDemos")} />
        <p className="text-sm text-muted-foreground">{t("productDemos.permissionDenied")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <ModulePageHeader
        title={t("navigation.productDemos")}
        subtitle={t("productDemos.subtitle")}
      />
      <ProductDemosSubNav />
      <Suspense fallback={<DashboardPageFallback />}>
        <div className="flex min-h-0 flex-1 flex-col">
          <Switch>
            <Route path={NEST_INDEX}>
              <Redirect to={PRODUCT_DEMOS_DEFAULT_NESTED_PATH} />
            </Route>
            {PRODUCT_DEMOS_ROUTE_REGISTRY.map((route) => (
              <Route key={route.id} path={route.nestedPath}>
                <GuardedProductDemosRoute route={route} />
              </Route>
            ))}
            <Route>
              <Redirect to={PRODUCT_DEMOS_DEFAULT_NESTED_PATH} />
            </Route>
          </Switch>
        </div>
      </Suspense>
    </div>
  );
}
