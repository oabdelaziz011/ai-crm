import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Redirect, Route, Switch, useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import {
  DASHBOARD_ROUTE_REGISTRY,
  sectionIdFromNestedPath,
} from "@/config/dashboard-route-registry";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { DashboardSectionRoute } from "@/components/dashboard/dashboard-section-route";
import { DashboardHomePage } from "@/pages/dashboard/home-page";

export function DashboardOutlet() {
  const [location] = useLocation();
  const activeSectionId = sectionIdFromNestedPath(location) ?? "home";

  return (
    <main className="relative flex-1 overflow-y-auto p-6 lg:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right,#80808012 1px,transparent 1px),linear-gradient(to bottom,#80808012 1px,transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%,#000 70%,transparent 100%)",
        }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSectionId}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative z-10 mx-auto max-w-6xl"
        >
          <Suspense fallback={<DashboardPageFallback />}>
            <Switch>
              <Route path="/profiles">
                <Redirect to="/settings/profile" />
              </Route>
              {DASHBOARD_ROUTE_REGISTRY.map((route) =>
                route.id === "subscriptions" || route.id === "workspace" || route.id === "settings" || route.id === "knowledge" ? (
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
                <DashboardHomePage />
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
