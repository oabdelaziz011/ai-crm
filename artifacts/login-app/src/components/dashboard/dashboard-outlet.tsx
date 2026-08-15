import { Suspense, lazy } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Redirect, Route, Switch, useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import {
  DASHBOARD_ROUTE_REGISTRY,
  sectionIdFromNestedPath,
} from "@/config/dashboard-route-registry";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { DashboardSectionRoute } from "@/components/dashboard/dashboard-section-route";

const DashboardHomePage = lazy(() =>
  import("@/pages/dashboard/home-page").then((module) => ({
    default: module.DashboardHomePage,
  })),
);

const CUSTOMER_WORKSPACE_PATH = /^\/customers\/[0-9a-f-]{36}(?:\/|$)/i;
const OMNICHANNEL_CONSOLE_PATH = /^\/omnichannel(?:\/|$)/i;
const CALENDAR_PATH = /^\/calendar(?:\/|$)/i;

export function DashboardOutlet() {
  const [location] = useLocation();
  const activeSectionId = sectionIdFromNestedPath(location) ?? "home";
  const isCustomerWorkspace = CUSTOMER_WORKSPACE_PATH.test(location);
  const isOmnichannelConsole = OMNICHANNEL_CONSOLE_PATH.test(location);
  const isCalendarPage = CALENDAR_PATH.test(location);
  const isFullBleed = isCustomerWorkspace || isOmnichannelConsole || isCalendarPage;

  return (
    <main
      className={
        isFullBleed
          ? "relative flex h-full min-h-0 flex-1 overflow-hidden p-0"
          : "relative flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8 lg:px-12"
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSectionId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={
            isFullBleed
              ? "relative z-10 flex h-full min-h-0 w-full flex-col"
              : "relative z-10 w-full"
          }
        >
          <Suspense fallback={<DashboardPageFallback />}>
            <Switch>
              <Route path="/profiles">
                <Redirect to="/settings/profile" />
              </Route>
              <Route path="/platform/ai-settings">
                <Redirect to="/settings/platform-ai" />
              </Route>
              {DASHBOARD_ROUTE_REGISTRY.map((route) =>
                route.id === "subscriptions" || route.id === "workspace" || route.id === "settings" || route.id === "knowledge" || route.id === "automation" || route.id === "scheduling" || route.id === "universal-operations" || route.id === "leads" || route.id === "opportunities" || route.id === "customers" || route.id === "ai-employees" ? (
                  <Route key={route.id} path={route.nestedPath} nest>
                    <DashboardSectionRoute route={route} />
                  </Route>
                ) : (
                  <Route key={route.id} path={route.nestedPath}>
                    <DashboardSectionRoute route={route} />
                  </Route>
                ),
              )}
              <Route path="/">
                <Suspense fallback={<DashboardPageFallback />}>
                  <DashboardHomePage />
                </Suspense>
              </Route>
              <Route>
                <NotFound />
              </Route>
            </Switch>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
