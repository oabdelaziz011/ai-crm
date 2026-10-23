import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const PRODUCT_DEMOS_BASE_NESTED_PATH = "/product-demos";

export type ProductDemosRouteId = "scheduling" | "bookings";

export type ProductDemosRouteDefinition = {
  id: ProductDemosRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
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

export const PRODUCT_DEMOS_ROUTE_REGISTRY: readonly ProductDemosRouteDefinition[] = [
  {
    id: "scheduling",
    nestedPath: "/scheduling",
    titleKey: "navigation.productDemoScheduling",
    permission: "product_demos.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/product-demos/product-demo-scheduling-page"),
      "ProductDemoSchedulingPage",
    ),
  },
  {
    id: "bookings",
    nestedPath: "/bookings",
    titleKey: "navigation.productDemoBookings",
    permission: "product_demos.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/product-demos/product-demo-bookings-page"),
      "ProductDemoBookingsPage",
    ),
  },
];

export const PRODUCT_DEMOS_DEFAULT_NESTED_PATH = "/scheduling";

export function productDemosNavItems() {
  return PRODUCT_DEMOS_ROUTE_REGISTRY;
}
