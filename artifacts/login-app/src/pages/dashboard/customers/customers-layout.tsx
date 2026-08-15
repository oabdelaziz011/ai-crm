import { Suspense } from "react";
import { motion } from "framer-motion";
import { Route, Switch, useParams } from "wouter";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { CustomerWorkspacePage } from "@/pages/dashboard/customers/customer-workspace-page";
import CustomersPage from "@/pages/dashboard/customers-page";
import { readCustomerWorkspaceContext } from "@/context/customer-profile-context";
import { NEST_INDEX } from "@/lib/routing";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function CustomerWorkspaceRoute() {
  const params = useParams<{ customerId: string; tab?: string }>();
  const customerId = params.customerId;

  if (!customerId || !UUID_PATTERN.test(customerId)) {
    return <CustomersPage />;
  }

  return (
    <motion.div
      className="flex h-full min-h-0 flex-col"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <CustomerWorkspacePage
        customerId={customerId}
        tab={params.tab}
        context={readCustomerWorkspaceContext(customerId)}
      />
    </motion.div>
  );
}

export default function CustomersLayout() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <Switch>
        <Route path={NEST_INDEX} component={CustomersPage} />
        <Route path="/:customerId/:tab?" component={CustomerWorkspaceRoute} />
      </Switch>
    </Suspense>
  );
}
