import { Suspense, useState } from "react";
import { Redirect, Route, Switch, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import {
  OPPORTUNITIES_DEFAULT_NESTED_PATH,
  OPPORTUNITIES_LEGACY_REDIRECT_PATHS,
  OPPORTUNITIES_ROUTE_REGISTRY,
} from "@/config/opportunities-route-registry";
import { OpportunitiesSubNav } from "@/components/opportunities/layout/opportunities-sub-nav";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/hooks/use-rbac";
import { useOpportunityList } from "@/hooks/opportunities/use-opportunity-commands";
import { useQuoteCommands } from "@/hooks/quotes/use-quote-commands";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useOpportunitiesRealtime } from "@/hooks/opportunities/use-opportunities-realtime";
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

function CreateQuoteFromOpportunityButton() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { setSelectedId } = useOpportunitiesWorkspace();
  const quoteCommands = useQuoteCommands();
  const listQuery = useOpportunityList({ limit: 100, offset: 0 });
  const [open, setOpen] = useState(false);
  const [opportunityId, setOpportunityId] = useState("");
  const canCreate = isSuperAdmin || hasPermission("quotes.create");
  if (!canCreate) return null;

  const rows = listQuery.data?.items ?? [];

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="rounded-xl"
        onClick={() => {
          setOpportunityId(rows[0]?.id ?? "");
          setOpen(true);
        }}
      >
        <FileText className="size-3.5" aria-hidden />
        {t("leads.table.rowActions.createQuote")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("leads.table.rowActions.createQuote")}</DialogTitle>
          </DialogHeader>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("opportunities.table.emptyBody")}</p>
          ) : (
            <Select value={opportunityId} onValueChange={setOpportunityId}>
              <SelectTrigger className="h-9" aria-label={t("navigation.opportunities")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button
              type="button"
              disabled={!opportunityId || quoteCommands.createFromOpportunity.isPending}
              onClick={() => {
                void quoteCommands.createFromOpportunity
                  .mutateAsync({ opportunityId })
                  .then(() => {
                    toast({ title: t("quotes.createSuccess") });
                    setOpen(false);
                    setSelectedId(opportunityId);
                  })
                  .catch((error: unknown) => {
                    toast({
                      title: t("quotes.createFailed"),
                      description: error instanceof Error ? error.message : undefined,
                      variant: "destructive",
                    });
                  });
              }}
            >
              {t("leads.table.rowActions.createQuote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OpportunitiesLayoutChrome() {
  const { t } = useTranslation("common");
  const { selectedId, setSelectedId } = useOpportunitiesWorkspace();
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
          <CreateQuoteFromOpportunityButton />
        </div>
      </div>

      <OpportunitiesSubNav />

      <Suspense fallback={<DashboardPageFallback />}>
        <Switch>
          <Route path={NEST_INDEX}>
            <Redirect to={OPPORTUNITIES_DEFAULT_NESTED_PATH} />
          </Route>
          {OPPORTUNITIES_LEGACY_REDIRECT_PATHS.map((legacyPath) => (
            <Route key={legacyPath} path={legacyPath}>
              <Redirect to={OPPORTUNITIES_DEFAULT_NESTED_PATH} />
            </Route>
          ))}
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
