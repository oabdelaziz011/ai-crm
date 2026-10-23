import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { Archive, Briefcase, Loader2, MoreHorizontal } from "lucide-react";
import { useOpportunitiesWorkspace } from "@/components/opportunities/layout/opportunities-workspace-context";
import {
  emptyDisplayValue,
  formatOpportunityDateTime,
  formatOpportunityMoney,
} from "@/components/opportunities/opportunity360-ui";
import {
  buildOpportunityListFilter,
  opportunityCustomerLabel,
  opportunityProductLabel,
} from "@/components/opportunities/table/opportunities-table-filters";
import { resolveOpportunityTableActions } from "@/components/opportunities/table/opportunities-table-row-actions";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import {
  resolveOpportunityStageLabel,
  useActiveOpportunityPipelineId,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import {
  useOpportunityCommands,
  useOpportunityList,
  useOpportunityPermissions,
} from "@/hooks/opportunities/use-opportunity-commands";
import { useToast } from "@/hooks/use-toast";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import { useDebouncedValue } from "@/lib/customers-list/use-debounced-value";
import { translateLeadLifecycleStatusSafe } from "@/components/leads/kanban/lead-stage-label";
import { OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES } from "@workspace/opportunity-platform";
import { reconcileOpportunitiesForVisibleLeads } from "@/lib/lead-platform/lead-opportunity-stage-sync-port-adapter";
import { supabase } from "@/lib/supabase";
import { LeadsStageBadge } from "@/components/leads/workspace/leads-stage-badge";
import { localizeOpportunityStageName } from "@/lib/sales/sales-localize";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const ALL_VALUE = "__all__";

export function OpportunitiesTablePage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company, user } = useAuth();
  const { setSelectedId } = useOpportunitiesWorkspace();
  const { canView, canEdit, canArchive } = useOpportunityPermissions();
  const commands = useOpportunityCommands();
  const empty = emptyDisplayValue(t);

  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 280);
  const [leadLifecycleStatus, setLeadLifecycleStatus] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [outcome, setOutcome] = useState<"" | "open" | "won" | "lost">("open");

  const [archiveTarget, setArchiveTarget] = useState<OpportunityReadModel | null>(null);

  const { pipelineId } = useActiveOpportunityPipelineId();
  const pipelineContext = useOpportunityPipelineContext(pipelineId);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, leadLifecycleStatus, ownerUserId, outcome, pipelineId]);

  useEffect(() => {
    if (!company?.id || !user?.id) return;
    let cancelled = false;
    void reconcileOpportunitiesForVisibleLeads(supabase, {
      companyId: company.id,
      actorUserId: user.id,
    })
      .then((result) => {
        if (cancelled || (result.created === 0 && result.repaired === 0)) return;
        void queryClient.invalidateQueries({ queryKey: ["opportunities-workspace", "list"] });
      })
      .catch((error: unknown) => {
        console.warn("[lead-opportunity-create]", error);
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id, user?.id, queryClient]);

  const listFilter = useMemo(
    () =>
      buildOpportunityListFilter({
        query: debouncedQuery,
        stageId: "",
        leadLifecycleStatus,
        ownerUserId,
        outcome,
        limit: PAGE_SIZE,
        offset,
        pipelineId: pipelineId ?? undefined,
      }),
    [debouncedQuery, leadLifecycleStatus, ownerUserId, outcome, offset, pipelineId],
  );

  const listQuery = useOpportunityList(listFilter);

  const { data: companyOwners } = useQuery({
    queryKey: ["employee-identities", "company", company?.id],
    enabled: Boolean(company?.id && canView),
    queryFn: () => EmployeeIdentityService.listByCompany(company!.id),
  });

  const ownerOptions = useMemo(() => {
    const rows = companyOwners ?? [];
    return rows
      .map((owner) => ({
        id: owner.userId || owner.id,
        label: owner.fullName?.trim() || owner.email?.trim() || owner.id,
      }))
      .filter((owner) => Boolean(owner.id));
  }, [companyOwners]);

  const rowActions = useMemo(
    () => resolveOpportunityTableActions({ canView, canEdit, canArchive }),
    [canView, canEdit, canArchive],
  );

  const failToast = (title: string, error?: unknown) => {
    toast({
      variant: "destructive",
      title,
      description: error instanceof Error ? error.message : undefined,
    });
  };

  const stageLabel = (opp: OpportunityReadModel) => {
    if (opp.leadId && opp.leadLifecycleStatus) {
      return translateLeadLifecycleStatusSafe(t, opp.leadLifecycleStatus);
    }
    return localizeOpportunityStageName(
      t,
      resolveOpportunityStageLabel(pipelineContext.stageById, opp.stageId, opp.stage),
    );
  };

  if (!canView) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.table.permissionTitle")}
        description={t("opportunities.table.permissionBody")}
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) return <DashboardPageFallback />;

  if (listQuery.isError) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.table.errorTitle")}
        description={
          listQuery.error instanceof Error
            ? listQuery.error.message
            : t("opportunities.table.errorBody")
        }
      />
    );
  }

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const archivePending = commands.archive.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1 space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="opp-table-search">
            {t("opportunities.table.filters.search")}
          </label>
          <Input
            id="opp-table-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("opportunities.table.searchPlaceholder")}
            aria-label={t("opportunities.table.searchPlaceholder")}
            className="h-9"
          />
        </div>

        <div className="w-[160px] space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="opp-table-stage">
            {t("opportunities.table.columns.stage")}
          </label>
          <Select
            value={leadLifecycleStatus || ALL_VALUE}
            onValueChange={(value) => setLeadLifecycleStatus(value === ALL_VALUE ? "" : value)}
          >
            <SelectTrigger id="opp-table-stage" className="h-9" aria-label={t("opportunities.table.columns.stage")}>
              <SelectValue placeholder={t("opportunities.table.filters.allStages")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{t("opportunities.table.filters.allStages")}</SelectItem>
              {OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES.map((status) => (
                <SelectItem key={status} value={status}>
                  {translateLeadLifecycleStatusSafe(t, status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px] space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="opp-table-owner">
            {t("opportunities.table.filters.owner")}
          </label>
          <Select
            value={ownerUserId || ALL_VALUE}
            onValueChange={(value) => setOwnerUserId(value === ALL_VALUE ? "" : value)}
          >
            <SelectTrigger id="opp-table-owner" className="h-9" aria-label={t("opportunities.table.filters.owner")}>
              <SelectValue placeholder={t("opportunities.table.filters.allOwners")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{t("opportunities.table.filters.allOwners")}</SelectItem>
              {ownerOptions.map((owner) => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[140px] space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="opp-table-outcome">
            {t("opportunities.table.filters.outcome")}
          </label>
          <Select
            value={outcome || ALL_VALUE}
            onValueChange={(value) =>
              setOutcome(value === ALL_VALUE ? "" : (value as "open" | "won" | "lost"))
            }
          >
            <SelectTrigger id="opp-table-outcome" className="h-9" aria-label={t("opportunities.table.filters.outcome")}>
              <SelectValue placeholder={t("opportunities.table.filters.allOutcomes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{t("opportunities.table.filters.allOutcomes")}</SelectItem>
              <SelectItem value="open">{t("opportunities.table.filters.outcomeOpen")}</SelectItem>
              <SelectItem value="won">{t("opportunities.table.filters.outcomeWon")}</SelectItem>
              <SelectItem value="lost">{t("opportunities.table.filters.outcomeLost")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EnterpriseEmptyState
          icon={<Briefcase className="size-6" aria-hidden />}
          title={t("opportunities.table.emptyTitle")}
          description={t("opportunities.table.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-start text-[13px]">
              <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.opportunity")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.product")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.stage")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.expectedRevenue")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.probability")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.owner")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("opportunities.table.columns.updatedAt")}
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    <span className="sr-only">{t("opportunities.table.columns.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((opp) => {
                  const customer = opportunityCustomerLabel({
                    companyName: opp.companyName,
                    primaryContact: opp.primaryContact,
                    missingLabel: t("opportunities.table.fallbacks.noCustomer"),
                  });
                  const product = opportunityProductLabel({
                    primaryProductName: opp.primaryProductName,
                    primaryProductId: opp.primaryProductId,
                    missingLabel: t("opportunities.table.fallbacks.noProduct"),
                  });
                  return (
                    <tr
                      key={opp.id}
                      className="cursor-pointer border-b border-border/30 transition hover:bg-muted/20"
                      onClick={() => setSelectedId(opp.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(opp.id);
                        }
                      }}
                      tabIndex={0}
                      aria-label={t("opportunities.table.rowActions.openNamed", {
                        name: opp.name,
                      })}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{opp.name}</div>
                        <div className="mt-0.5 text-[12px] text-muted-foreground">{customer}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{product}</td>
                      <td className="px-4 py-3">
                        <LeadsStageBadge
                          label={stageLabel(opp)}
                          lifecycleStatus={opp.leadLifecycleStatus}
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatOpportunityMoney(opp.expectedRevenue, opp.currency) || empty}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{opp.probabilityPercent}%</td>
                      <td className="px-4 py-3">{opp.owner?.trim() || empty}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatOpportunityDateTime(opp.updatedAt, i18n.language) || empty}
                      </td>
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        {rowActions.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={t("opportunities.table.rowActions.menu")}
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[180px]">
                              <DropdownMenuLabel>
                                {t("opportunities.table.rowActions.menu")}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {rowActions.map((action) => (
                                <DropdownMenuItem
                                  key={action.id}
                                  className={cn(
                                    action.destructive && "text-destructive focus:text-destructive",
                                  )}
                                  disabled={action.id === "archive" && archivePending}
                                  onClick={() => {
                                    if (action.id === "openOpportunity360") {
                                      setSelectedId(opp.id);
                                      return;
                                    }
                                    if (action.id === "archive") {
                                      setArchiveTarget(opp);
                                    }
                                  }}
                                >
                                  {action.id === "archive" ? (
                                    <Archive className="size-3.5" aria-hidden />
                                  ) : null}
                                  {t(action.labelKey)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {total === 0
                ? t("opportunities.table.pagination.empty")
                : t("opportunities.table.pagination.range", {
                    from: offset + 1,
                    to: Math.min(offset + PAGE_SIZE, total),
                    total,
                  })}
            </span>
            <div className="flex items-center gap-2">
              {listQuery.isFetching ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={offset === 0 || listQuery.isFetching}
                onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              >
                {t("opportunities.table.pagination.previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={offset + PAGE_SIZE >= total || listQuery.isFetching}
                onClick={() => setOffset((value) => value + PAGE_SIZE)}
              >
                {t("opportunities.table.pagination.next")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DeleteDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        isPending={archivePending}
        title={t("opportunities360.archive.title")}
        description={t("opportunities360.archive.description", {
          name: archiveTarget?.name ?? "",
        })}
        confirmLabel={t("opportunities360.actions.archive")}
        onConfirm={() => {
          if (!archiveTarget) return;
          void commands.archive
            .mutateAsync({ opportunityId: archiveTarget.id })
            .then(() => {
              toast({ title: t("opportunities360.archive.success") });
              setArchiveTarget(null);
            })
            .catch((error: unknown) => {
              failToast(t("opportunities360.archive.failed"), error);
            });
        }}
      />
    </div>
  );
}
