import { Suspense, useState } from "react";
import { Redirect, Route, Switch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  OPPORTUNITIES_DEFAULT_NESTED_PATH,
  OPPORTUNITIES_ROUTE_REGISTRY,
} from "@/config/opportunities-route-registry";
import { OpportunitiesSubNav } from "@/components/opportunities/layout/opportunities-sub-nav";
import { OpportunityCreateDialog } from "@/components/opportunities/opportunity-create-dialog";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-rbac";
import { useAuth } from "@/context/auth-context";
import { useOpportunitiesRealtime } from "@/hooks/opportunities/use-opportunities-realtime";
import { useToast } from "@/hooks/use-toast";
import { NEST_INDEX } from "@/lib/routing";
import {
  OpportunitiesWorkspaceProvider,
  useOpportunitiesWorkspace,
} from "./opportunities-workspace-context";

function GuardedOpportunitiesRoute({
  route,
}: {
  route: (typeof OPPORTUNITIES_ROUTE_REGISTRY)[number];
}) {
  const { hasPermission, isSuperAdmin } = useAuthUser();
  if (route.permission && !isSuperAdmin && !hasPermission(route.permission)) {
    return null;
  }
  const Page = route.Page;
  return <Page />;
}

function OpportunitiesLayoutChrome() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("opportunities.create");
  const { selectedId, setSelectedId, createOpen, setCreateOpen } = useOpportunitiesWorkspace();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadInitialTab, setLeadInitialTab] = useState<"overview" | "activity">("overview");

  return (
    <div className="flex min-h-0 w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            {t("navigation.opportunities")}
          </h1>
          <p className="text-[13px] text-muted-foreground">{t("opportunities.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl">
            <Link href="~/dashboard/products">{t("navigation.products")}</Link>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl">
            <Link href="~/dashboard/quotes">{t("navigation.quotes")}</Link>
          </Button>
          {canCreate ? (
            <Button type="button" className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("opportunities.create")}
            </Button>
          ) : null}
        </div>
      </div>

      <OpportunitiesSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={OPPORTUNITIES_DEFAULT_NESTED_PATH} />
          </Route>
          {OPPORTUNITIES_ROUTE_REGISTRY.map((route) => (
            <Route key={route.id} path={route.nestedPath}>
              <GuardedOpportunitiesRoute route={route} />
            </Route>
          ))}
        </Switch>
      </Suspense>

      <Opportunity360Workspace
        opportunityId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onOpenLead={(nextLeadId, intent) => {
          setSelectedId(null);
          setLeadInitialTab(intent === "activity" ? "activity" : "overview");
          setLeadId(nextLeadId);
        }}
      />

      <Lead360Workspace
        leadId={leadId}
        open={Boolean(leadId)}
        initialTab={leadInitialTab}
        onClose={() => {
          setLeadId(null);
          setLeadInitialTab("overview");
        }}
      />

      <OpportunityCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        source={{ mode: "manual" }}
        onCreated={(id) => {
          toast({ title: t("opportunities.created") });
          setSelectedId(id);
        }}
      />
    </div>
  );
}

export function OpportunitiesLayout() {
  const { company } = useAuth();
  useOpportunitiesRealtime(company?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <OpportunitiesWorkspaceProvider
      value={{
        selectedId,
        setSelectedId,
        createOpen,
        setCreateOpen,
      }}
    >
      <OpportunitiesLayoutChrome />
    </OpportunitiesWorkspaceProvider>
  );
}
