import { Briefcase, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import type {
  OpportunityReadModel,
  QuoteReadModel,
} from "@workspace/application-layer";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  ENTITY_360_DIALOG_CONTENT_CLASS,
  ENTITY_360_TAB_TRIGGER_CLASS,
  ENTITY_360_TABS_LIST_CLASS,
} from "@/components/entity-workspace/entity-360-dialog-shell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { OpportunityProductsPanel } from "@/components/products/product360-workspace";
import {
  OpportunityQuotesPanel,
  Quote360Workspace,
} from "@/components/quotes/quote360-workspace";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { useLead360Workspace } from "@/hooks/leads/use-lead360-workspace";
import {
  useOpportunityCommands,
  useOpportunityPermissions,
  useOpportunityPipelineBoard,
  useOpportunityWorkspace,
} from "@/hooks/opportunities/use-opportunity-commands";
import {
  getOpportunityStageDisplayName,
  useActiveOpportunityPipelineId,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import { useOpportunityLineItems } from "@/hooks/products/use-product-commands";
import { useOpportunityQuotes, useQuoteCommands } from "@/hooks/quotes/use-quote-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import { localizeOpportunityStageName } from "@/lib/sales/sales-localize";
import { cn } from "@/lib/utils";
import { Opportunity360Header } from "./opportunity360-header";
import { Opportunity360Overview } from "./opportunity360-overview";
import { Opportunity360Skeleton, formatOpportunityMoney } from "./opportunity360-ui";
import { Opportunity360AuditPanel } from "./opportunity360-audit-panel";
import { OpportunityPermissionDeniedState } from "./opportunity360-permission-denied";
import { OPPORTUNITY360_TABS, type Opportunity360Tab } from "./opportunity360-tabs";

export { OPPORTUNITY360_TABS } from "./opportunity360-tabs";

function money(value: number | null, currency: string | null | undefined) {
  return formatOpportunityMoney(value, currency);
}

function resolveCurrentQuote(
  opportunity: OpportunityReadModel,
  quotes: readonly QuoteReadModel[],
): QuoteReadModel | null {
  if (!quotes.length) return null;
  if (opportunity.currentQuoteId) {
    const match = quotes.find((quote) => quote.id === opportunity.currentQuoteId);
    if (match) return match;
  }
  return quotes[0] ?? null;
}

/**
 * Do not import Lead360Workspace here — Lead360 already imports this module
 * (mutual workspace imports break the leads table lazy chunk). Pass `onOpenLead`.
 */
export function Opportunity360Workspace({
  opportunityId,
  open,
  onOpenChange,
  onOpenLead,
}: {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLead?: (leadId: string, intent?: "overview" | "activity") => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { canView, canArchive } = useOpportunityPermissions();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreateQuote =
    isSuperAdmin ||
    hasPermission("quotes.create") ||
    hasPermission("opportunities.create") ||
    hasPermission("opportunities.edit");
  const { openCustomerProfile } = useCustomerProfile();
  const { data, isLoading, isError, refetch } = useOpportunityWorkspace(opportunityId);
  const opportunity = data?.opportunity ?? null;
  const pipelineContext = useOpportunityPipelineContext(opportunity?.pipelineId);
  const leadWorkspace = useLead360Workspace(open ? opportunity?.leadId ?? null : null);
  const linesQuery = useOpportunityLineItems(opportunity?.id ?? null);
  const quotesQuery = useOpportunityQuotes(opportunity?.id ?? null);
  const commands = useOpportunityCommands();
  const quoteCommands = useQuoteCommands();

  const [tab, setTab] = useState<Opportunity360Tab>("overview");

  useEffect(() => {
    if (!OPPORTUNITY360_TABS.includes(tab)) {
      setTab("overview");
    }
  }, [tab]);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const quoteOpenRef = useRef(false);
  const quoteClosingGuardRef = useRef(false);

  useEffect(() => {
    quoteOpenRef.current = quoteOpen;
  }, [quoteOpen]);

  const setQuoteDialogOpen = useCallback((next: boolean) => {
    if (!next) {
      quoteClosingGuardRef.current = true;
      setQuoteOpen(false);
      window.setTimeout(() => {
        quoteClosingGuardRef.current = false;
      }, 400);
      return;
    }
    setQuoteOpen(true);
  }, []);

  const updatePending = commands.archive.isPending;
  const productsCount = linesQuery.isSuccess ? linesQuery.data.length : null;
  const currentQuote = useMemo(
    () => (opportunity ? resolveCurrentQuote(opportunity, quotesQuery.data?.items ?? []) : null),
    [opportunity, quotesQuery.data?.items],
  );
  const { pipelines } = useActiveOpportunityPipelineId();
  const pipelineName = useMemo(() => {
    const id = opportunity?.pipelineId ?? pipelineContext.pipelineId;
    if (!id) return null;
    return pipelines.find((pipeline) => pipeline.id === id)?.name ?? null;
  }, [opportunity?.pipelineId, pipelineContext.pipelineId, pipelines]);

  const leadContext = useMemo(() => {
    const lead = leadWorkspace.data?.lead;
    if (!lead) return null;
    return {
      phone: lead.phone ?? null,
      email: lead.email ?? null,
    };
  }, [leadWorkspace.data?.lead]);

  const tabs = OPPORTUNITY360_TABS.map(
    (id) => [id, t(`opportunities360.tabs.${id}`)] as const,
  );

  const navigation = {
    onOpenCustomer: (customerId: string) => {
      openCustomerProfile({ customerId, tab: "overview" });
    },
    onOpenCompany: () => {
      setLocation(companyWorkspaceHref("overview"));
    },
    onOpenLead,
    onOpenOwner: (ownerId: string) => {
      setLocation(companyWorkspaceHref("employees", { employeeId: ownerId }));
    },
    onOpenQuote: (nextQuoteId: string) => {
      setQuoteId(nextQuoteId);
      setQuoteDialogOpen(true);
    },
  };

  const failToast = useCallback(
    (titleKey: string, error?: unknown) => {
      toast({
        variant: "destructive",
        title: t(titleKey),
        description: resolveApplicationErrorMessage(error),
      });
    },
    [toast, t],
  );

  const handleCreateQuote = useCallback(() => {
    if (!opportunity) return;
    void quoteCommands.createFromOpportunity
      .mutateAsync({ opportunityId: opportunity.id })
      .then((result) => {
        toast({ title: t("opportunities.quotes.createSuccess") });
        setTab("quotes");
        setQuoteId(result.quote.id);
        setQuoteDialogOpen(true);
      })
      .catch((error: unknown) => failToast("opportunities.quotes.createFailed", error));
  }, [opportunity, quoteCommands.createFromOpportunity, toast, t, failToast, setQuoteDialogOpen]);

  const handleArchiveConfirm = () => {
    if (!opportunity) return;
    void commands.archive
      .mutateAsync({ opportunityId: opportunity.id })
      .then(() => {
        toast({ title: t("opportunities360.archive.success") });
        setArchiveOpen(false);
        onOpenChange(false);
      })
      .catch((error: unknown) => failToast("opportunities360.archive.failed", error));
  };

  if (open && !canView) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="sr-only">{t("opportunities.permissionDenied")}</DialogTitle>
          <OpportunityPermissionDeniedState />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Nested Quote360: ignore dismiss while quote is open or just closing
          // (Radix focus restore otherwise closes Opportunity and dumps to the list).
          if (!next && (quoteOpenRef.current || quoteClosingGuardRef.current)) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          className={cn(ENTITY_360_DIALOG_CONTENT_CLASS)}
          onInteractOutside={(event) => {
            if (quoteOpenRef.current || quoteClosingGuardRef.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (quoteOpenRef.current || quoteClosingGuardRef.current) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (quoteOpenRef.current || quoteClosingGuardRef.current) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (quoteOpenRef.current || quoteClosingGuardRef.current) event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{opportunity?.name ?? t("navigation.opportunities")}</DialogTitle>

          {isLoading ? (
            <Opportunity360Skeleton />
          ) : isError || !opportunity ? (
            <div className="p-6">
              <EnterpriseEmptyState
                icon={<Briefcase className="size-6" aria-hidden />}
                title={t("opportunities360.loadError")}
                description={t("opportunities360.loadErrorBody")}
                primaryAction={{
                  label: t("common.retry"),
                  onClick: () => void refetch(),
                }}
              />
            </div>
          ) : (
            <>
              <Opportunity360Header
                opportunity={opportunity}
                leadContext={leadContext}
                canArchive={canArchive}
                canCreateQuote={canCreateQuote}
                createQuotePending={quoteCommands.createFromOpportunity.isPending}
                updatePending={updatePending}
                onArchive={() => setArchiveOpen(true)}
                onClose={() => onOpenChange(false)}
                onOpenLead={onOpenLead ? (leadId) => onOpenLead(leadId, "overview") : undefined}
                onCreateQuote={handleCreateQuote}
                locale={i18n.language}
              />

              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as Opportunity360Tab)}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <TabsList className={ENTITY_360_TABS_LIST_CLASS}>
                  {tabs.map(([id, label]) => (
                    <TabsTrigger key={id} value={id} className={ENTITY_360_TAB_TRIGGER_CLASS}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:px-8">
                  <TabsContent value="overview" className="mt-0">
                    {tab === "overview" ? (
                      <Opportunity360Overview
                        opportunity={opportunity}
                        locale={i18n.language}
                        currentQuote={currentQuote}
                        navigation={navigation}
                        stageById={pipelineContext.stageById}
                        pipelineName={pipelineName}
                        leadContext={leadContext}
                        productsCount={productsCount}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="products" className="mt-0">
                    {tab === "products" ? (
                      <OpportunityProductsPanel
                        opportunityId={opportunity.id}
                        currency={opportunity.currency}
                        country={opportunity.country}
                        market={opportunity.market}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="quotes" className="mt-0">
                    {tab === "quotes" ? (
                      <OpportunityQuotesPanel
                        opportunityId={opportunity.id}
                        showCreateButton={false}
                        onOpenQuote={(id) => {
                          setQuoteId(id);
                          setQuoteDialogOpen(true);
                        }}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="audit" className="mt-0">
                    {tab === "audit" ? (
                      <Opportunity360AuditPanel
                        history={data?.history ?? []}
                        locale={i18n.language}
                        stageById={pipelineContext.stageById}
                        opportunityCurrency={opportunity.currency}
                      />
                    ) : null}
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchiveConfirm}
        isPending={commands.archive.isPending}
        title={t("opportunities360.archive.title")}
        description={t("opportunities360.archive.description", { name: opportunity?.name ?? "" })}
      />

      <Quote360Workspace
        quoteId={quoteId}
        open={quoteOpen}
        onOpenChange={setQuoteDialogOpen}
        onVersionCreated={(id) => setQuoteId(id)}
        initialTab="products"
        contactPhone={leadContext?.phone ?? null}
        contactEmail={leadContext?.email ?? null}
      />
    </>
  );
}

export function OpportunityPipelineBoard({
  onSelect,
  onCreate,
  canCreate = false,
}: {
  onSelect: (opportunityId: string) => void;
  onCreate?: () => void;
  canCreate?: boolean;
}) {
  const { t } = useTranslation("common");
  const { canView } = useOpportunityPermissions();
  const { pipelineId: defaultPipelineId, isLoading: pipelinesLoading } =
    useActiveOpportunityPipelineId();
  const board = useOpportunityPipelineBoard(defaultPipelineId);

  if (!canView) {
    return <OpportunityPermissionDeniedState compact />;
  }

  if (pipelinesLoading || board.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (!board.data?.stages.length) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.pipeline.emptyTitle")}
        description={t("opportunities.pipeline.emptyBody")}
        primaryAction={
          canCreate && onCreate
            ? {
                label: t("opportunities.create"),
                onClick: onCreate,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-18rem)] gap-3 overflow-x-auto pb-2">
      {board.data.stages.map((stage) => (
        <div
          key={stage.id}
          className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-border/50 bg-muted/10"
        >
          <div className="border-b border-border/40 px-3.5 py-3">
            <div className="text-[13px] font-semibold">
              {localizeOpportunityStageName(t, getOpportunityStageDisplayName(stage))}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {stage.opportunities.length} · {stage.defaultProbabilityPercent}%
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-2.5">
            {stage.opportunities.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => onSelect(opp.id)}
                className="rounded-xl border border-border/40 bg-background px-3 py-2.5 text-start transition hover:border-border hover:bg-card"
              >
                <div className="truncate text-[13px] font-medium">{opp.name}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {opp.companyName || opp.primaryContact || "—"}
                </div>
                <div className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {money(opp.expectedRevenue, opp.currency)} · {opp.probabilityPercent}%
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
