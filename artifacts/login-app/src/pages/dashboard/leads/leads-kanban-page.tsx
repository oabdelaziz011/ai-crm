import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import {
  EMPTY_KANBAN_FILTERS,
  EnterpriseKanban,
  KanbanFilters,
  type EnterpriseKanbanLabels,
  type KanbanCardModel,
  type KanbanColumnModel,
  type KanbanContextAction,
  type KanbanFiltersState,
  type KanbanMetric,
  type KanbanQuickAction,
} from "@/components/enterprise/kanban";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import {
  LeadsCreateDialog,
  type LeadsCreateOption,
} from "@/components/leads/workspace/leads-create-dialog";
import {
  leadFormDraftToUpdatePatch,
  leadToFormDraft,
} from "@/components/leads/workspace/leads-form-draft";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { LeadKanbanDrawer } from "@/components/leads/kanban/lead-kanban-drawer";
import {
  formatLeadMoney,
  leadMatchesFilters,
  leadMatchesSearch,
  mapLeadToKanbanCard,
  resolveLeadScoreTone,
} from "@/components/leads/kanban/lead-kanban-mappers";
import { translateLeadPipelineLabel } from "@/components/leads/kanban/lead-pipeline-label";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import { useAuth } from "@/context/auth-context";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import {
  useLeadDashboardMetrics,
  useLeadKanbanBoard,
  useLeadPipelines,
  useLeadSources,
  useLeadStages,
} from "@/hooks/leads/use-leads-workspace";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { mapLeadReadModelToWorkspaceRow } from "@/lib/application-layer/lead-workspace-row-mapper";
import { getCompanyCurrency } from "@/lib/company-locale/runtime";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";

const STAGE_ACCENTS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
];

export function LeadsKanbanPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { user, company } = useAuth();
  const { currency: companyCurrency } = useCompanyLocaleContext();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("leads.create");
  const canEdit = isSuperAdmin || hasPermission("leads.edit");
  const canDelete = isSuperAdmin || hasPermission("leads.delete");
  const { isEnabled: aiEnabled } = useAgentsFeatureEnabled();

  const { data: pipelines } = useLeadPipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const { data: board, isLoading } = useLeadKanbanBoard(pipelineId);
  const { data: metrics } = useLeadDashboardMetrics();
  const { data: stages } = useLeadStages(pipelineId);
  const { data: sources } = useLeadSources();
  const commands = useLeadCommands();
  const opportunityCommands = useOpportunityCommands();

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<KanbanFiltersState>(EMPTY_KANBAN_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<KanbanFiltersState>(EMPTY_KANBAN_FILTERS);
  const [hiddenStageIds, setHiddenStageIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editLead, setEditLead] = useState<LeadWorkspaceRow | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [drawerLead, setDrawerLead] = useState<LeadWorkspaceRow | null>(null);
  const [lead360Id, setLead360Id] = useState<string | null>(null);
  const [lead360Tab, setLead360Tab] = useState<"overview" | "activity" | "ai">("overview");

  const openLead360 = (leadId: string, tab: "overview" | "activity" | "ai" = "overview") => {
    setLead360Tab(tab);
    setLead360Id(leadId);
  };

  const { data: companyOwners } = useQuery({
    queryKey: ["leads-workspace", "owners", company?.id],
    enabled: Boolean(company?.id && (isSuperAdmin || hasPermission("leads.view"))),
    queryFn: () => EmployeeIdentityService.listByCompany(company!.id),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!pipelineId && pipelines?.length) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
      setPipelineId(defaultPipeline?.id ?? null);
    }
  }, [pipelineId, pipelines]);

  const labels = useMemo(
    (): EnterpriseKanbanLabels => ({
      pageTitle: t("navigation.leads"),
      pipeline: t("leads.kanban.pipeline"),
      searchPlaceholder: t("leads.kanban.searchPlaceholder"),
      filters: t("leads.kanban.filters"),
      customizeColumns: t("leads.kanban.customizeColumns"),
      create: t("leads.workspace.newLead"),
      emptyColumn: t("leads.kanban.emptyColumn"),
      addInColumn: t("leads.kanban.addInColumn"),
      dropHere: t("leads.kanban.dropHere"),
      moveSuccess: t("leads.kanban.moveSuccess"),
      quickActions: t("leads.workspace.panel.quickActions"),
      more: t("leads.kanban.more"),
      openDrawer: t("leads.kanban.openDrawer"),
      metricsGroup: t("leads.kanban.metricsGroup"),
    }),
    [t],
  );

  const kpiMetrics = useMemo((): KanbanMetric[] => {
    const allLeads = board
      ? Object.values(board.leadsByStage).flatMap((rows) => rows)
      : [];
    const totalValue = allLeads.reduce((sum, lead) => sum + (lead.expectedValue ?? 0), 0);
    const openLeads = allLeads.filter(
      (lead) => !["won", "lost", "converted", "archived"].includes(lead.lifecycleStatus),
    ).length;

    return [
      {
        id: "total",
        label: t("leads.kanban.kpi.totalLeads"),
        value: String(metrics?.totalLeads ?? allLeads.length),
      },
      {
        id: "value",
        label: t("leads.kanban.kpi.totalValue"),
        value: formatLeadMoney(metrics?.forecastValue ?? totalValue),
      },
      {
        id: "conversion",
        label: t("leads.kanban.kpi.conversionRate"),
        value: `${Math.round((metrics?.conversionRate ?? 0) * 1000) / 10}%`,
      },
      {
        id: "open",
        label: t("leads.kanban.kpi.openOpportunities"),
        value: String(openLeads),
      },
    ];
  }, [board, companyCurrency, i18n.language, metrics, t]);

  const columns = useMemo((): KanbanColumnModel<LeadWorkspaceRow>[] => {
    if (!board) return [];
    return board.stages
      .filter((stage) => !hiddenStageIds.includes(stage.id))
      .filter((stage) => !appliedFilters.stageId || appliedFilters.stageId === stage.id)
      .map((stage, index) => {
        const leads = (board.leadsByStage[stage.id] ?? [])
          .map((lead) => mapLeadReadModelToWorkspaceRow(lead))
          .filter((lead) => leadMatchesSearch(lead, search || appliedFilters.search))
          .filter((lead) =>
            leadMatchesFilters(lead, appliedFilters, resolveLeadScoreTone(lead)),
          );

        const totalValue = leads.reduce((sum, lead) => sum + (lead.expectedValue ?? 0), 0);

        return {
          id: stage.id,
          title: translateLeadStageLabel(t, stage),
          countLabel: t("leads.kanban.columnCount", { count: leads.length }),
          valueLabel: formatLeadMoney(totalValue),
          accentClassName: STAGE_ACCENTS[index % STAGE_ACCENTS.length],
          cards: leads.map((lead) =>
            mapLeadToKanbanCard(t, lead, i18n.language, Boolean(aiEnabled)),
          ),
        };
      });
  }, [aiEnabled, appliedFilters, board, companyCurrency, hiddenStageIds, i18n.language, search, t]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const owner of companyOwners ?? []) {
      if (owner.userId) map.set(owner.userId, owner.fullName);
    }
    for (const column of columns) {
      for (const card of column.cards) {
        if (card.data.ownerId && card.data.owner) map.set(card.data.ownerId, card.data.owner);
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [columns, companyOwners]);

  const sourceOptions = useMemo(
    () =>
      (sources ?? []).map((source) => {
        const key = `leads.sources.${(source.slug || source.name).toLowerCase().replace(/[\s-]+/g, "_")}`;
        const translated = t(key);
        return {
          id: source.id,
          label: translated !== key ? translated : source.name,
        };
      }),
    [sources, t],
  );

  const stageOptions = useMemo(
    (): LeadsCreateOption[] =>
      (stages ?? []).map((stage) => ({
        id: stage.id,
        label: translateLeadStageLabel(t, stage),
      })),
    [stages, t],
  );

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const column of columns) {
      for (const card of column.cards) {
        for (const tag of card.data.tags) tags.add(tag);
      }
    }
    return [...tags].map((tag) => ({ id: tag, label: tag }));
  }, [columns]);

  const filtersActive = useMemo(() => {
    const { search: _s, ...rest } = appliedFilters;
    return Object.values(rest).some((value) => value != null && value !== "");
  }, [appliedFilters]);

  const getQuickActions = (card: KanbanCardModel<LeadWorkspaceRow>): KanbanQuickAction[] => {
    const lead = card.data;
    const callLabel = t("leads.workspace.actions.call");
    const whatsappLabel = t("leads.workspace.actions.whatsapp");
    const emailLabel = t("leads.workspace.actions.email");
    const activityLabel = t("leads.kanban.actions.createActivity");
    const opportunityLabel = t("leads.kanban.actions.createOpportunity");

    return [
      {
        id: "call",
        label: callLabel,
        title: callLabel,
        disabled: !lead.phone,
        onSelect: () => {
          if (lead.phone) window.open(`tel:${lead.phone}`, "_self");
        },
      },
      {
        id: "whatsapp",
        label: whatsappLabel,
        title: whatsappLabel,
        disabled: !lead.phone,
        onSelect: () => {
          if (lead.phone) {
            window.open(`https://wa.me/${lead.phone.replace(/[^\d+]/g, "")}`, "_blank");
          }
        },
      },
      {
        id: "email",
        label: emailLabel,
        title: emailLabel,
        disabled: !lead.email,
        onSelect: () => {
          if (lead.email) window.open(`mailto:${lead.email}`, "_self");
        },
      },
      {
        id: "activity",
        label: activityLabel,
        title: activityLabel,
        onSelect: () => openLead360(lead.id, "activity"),
      },
      {
        id: "opportunity",
        label: opportunityLabel,
        title: opportunityLabel,
        disabled: !canEdit || opportunityCommands.createFromLead.isPending,
        onSelect: () => {
          void opportunityCommands.createFromLead
            .mutateAsync({ leadId: lead.id, name: lead.name || lead.contactPerson })
            .then((opp) => {
              if (!opp?.id) {
                toast({
                  title: t("leads.kanban.actions.opportunityFailed"),
                  variant: "destructive",
                });
                return;
              }
              toast({ title: t("leads.kanban.actions.opportunityCreated") });
              setOpportunityId(opp.id);
            })
            .catch((error: Error) => {
              toast({
                title: t("leads.kanban.actions.opportunityFailed"),
                description: error.message,
                variant: "destructive",
              });
            });
        },
      },
    ];
  };

  const getContextActions = (card: KanbanCardModel<LeadWorkspaceRow>): KanbanContextAction[] => {
    const lead = card.data;
    return [
      {
        id: "open",
        label: t("leads.kanban.openDrawer"),
        onSelect: () => setDrawerLead(lead),
      },
      {
        id: "edit",
        label: t("leads.kanban.context.editLead"),
        disabled: !canEdit,
        onSelect: () => {
          setEditLead(lead);
          setEditOpen(true);
        },
      },
      {
        id: "lead360",
        label: t("leads.kanban.drawer.openLead360"),
        onSelect: () => openLead360(lead.id, "overview"),
      },
      {
        id: "convert",
        label: t("leads360.convert"),
        disabled: !canEdit,
        onSelect: () => {
          void commands.convert
            .mutateAsync({ leadId: lead.id })
            .then(() => {
              toast({ title: t("leads.kanban.actions.converted") });
            })
            .catch((error: Error) => {
              toast({
                title: t("leads.kanban.actions.convertFailed"),
                description: error.message,
                variant: "destructive",
              });
            });
        },
      },
      {
        id: "assign",
        label: t("leads.kanban.context.assignOwner"),
        disabled: !canEdit || !user?.id || commands.assign.isPending,
        onSelect: () => {
          if (!user?.id) return;
          void commands.assign.mutateAsync({ leadId: lead.id, ownerId: user.id }).then(() => {
            toast({ title: t("leads.kanban.context.assigned") });
          });
        },
      },
      {
        id: "delete",
        label: t("leads.kanban.context.delete"),
        destructive: true,
        disabled: !canDelete,
        onSelect: () => {
          void commands.archive.mutateAsync({ leadId: lead.id }).then(() => {
            toast({ title: t("leads.kanban.context.deleted") });
            setDrawerLead((current) => (current?.id === lead.id ? null : current));
          });
        },
      },
    ];
  };

  if (isLoading && !board) return <DashboardPageFallback />;

  const drawerStage = board?.stages.find((stage) => stage.id === drawerLead?.stageId);

  return (
    <div className="flex w-full flex-col gap-1" dir={i18n.dir()}>
      <EnterpriseKanban
        labels={labels}
        metrics={kpiMetrics}
        pipelines={(pipelines ?? []).map((pipeline) => ({
          id: pipeline.id,
          label: translateLeadPipelineLabel(t, pipeline),
        }))}
        pipelineId={pipelineId}
        onPipelineChange={setPipelineId}
        search={search}
        onSearchChange={setSearch}
        onOpenFilters={() => setFiltersOpen(true)}
        onCustomizeColumns={() => {
          if (!board?.stages.length) return;
          const nextHidden =
            hiddenStageIds.length > 0
              ? []
              : board.stages.filter((stage) => stage.isTerminal).map((stage) => stage.id);
          setHiddenStageIds(nextHidden);
          toast({
            title: t("leads.kanban.customizeColumns"),
            description:
              nextHidden.length > 0
                ? t("leads.kanban.customizeHiddenTerminal")
                : t("leads.kanban.customizeShownAll"),
          });
        }}
        onCreate={() => {
          setCreateStageId(undefined);
          setCreateOpen(true);
        }}
        canCreate={canCreate}
        filtersActive={filtersActive}
        columns={columns}
        onMoveCard={({ cardId, toColumnId }) => {
          if (!canEdit) {
            toast({
              title: t("leads.kanban.moveDenied"),
              variant: "destructive",
            });
            return;
          }
          void commands.changeStage
            .mutateAsync({ leadId: cardId, stageId: toColumnId })
            .then(() => {
              toast({ title: t("leads.kanban.moveSuccess") });
            })
            .catch(() => {
              toast({
                title: t("leads.kanban.moveFailed"),
                variant: "destructive",
              });
            });
        }}
        onCardOpen={(card) => setDrawerLead(card.data)}
        onCreateInColumn={(columnId) => {
          setCreateStageId(columnId);
          setCreateOpen(true);
        }}
        getQuickActions={getQuickActions}
        getContextActions={getContextActions}
      />

      <KanbanFilters
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={t("leads.kanban.filters")}
        applyLabel={t("leads.kanban.applyFilters")}
        resetLabel={t("leads.kanban.resetFilters")}
        value={filters}
        onChange={setFilters}
        onApply={() => setAppliedFilters({ ...filters, search })}
        owners={ownerOptions}
        sources={sourceOptions}
        scoreBands={[
          { id: "cold", label: t("leads.scoreBand.cold") },
          { id: "warm", label: t("leads.scoreBand.warm") },
          { id: "hot", label: t("leads.scoreBand.hot") },
          { id: "urgent", label: t("leads.scoreBand.urgent") },
        ]}
        stages={(board?.stages ?? []).map((stage) => ({
          id: stage.id,
          label: translateLeadStageLabel(t, stage),
        }))}
        cities={[]}
        countries={[]}
        tags={tagOptions}
        fieldLabels={{
          owner: t("leads.columns.owner"),
          source: t("leads.columns.source"),
          score: t("leads.columns.score"),
          city: t("leads.kanban.filter.city"),
          country: t("leads.workspace.fields.country"),
          stage: t("leads.columns.stage"),
          valueMin: t("leads.kanban.filter.valueMin"),
          valueMax: t("leads.kanban.filter.valueMax"),
          createdFrom: t("leads.kanban.filter.createdFrom"),
          createdTo: t("leads.kanban.filter.createdTo"),
          lastActivityFrom: t("leads.kanban.filter.lastActivityFrom"),
          lastActivityTo: t("leads.kanban.filter.lastActivityTo"),
          tags: t("leads.workspace.fields.tags"),
        }}
      />

      <LeadKanbanDrawer
        lead={drawerLead}
        open={Boolean(drawerLead)}
        onOpenChange={(open) => {
          if (!open) setDrawerLead(null);
        }}
        stageName={drawerStage?.name}
        stageSlug={drawerStage?.slug}
        lifecycleStatus={drawerStage?.lifecycleStatus}
        aiEnabled={Boolean(aiEnabled)}
        onOpenLead360={() => {
          if (drawerLead) openLead360(drawerLead.id, "overview");
        }}
        onSendWhatsApp={() => {
          if (drawerLead?.phone) {
            window.open(`https://wa.me/${drawerLead.phone.replace(/[^\d+]/g, "")}`, "_blank");
          }
        }}
        onCreateActivity={() => {
          if (drawerLead) openLead360(drawerLead.id, "activity");
        }}
      />

      <Lead360Workspace
        leadId={lead360Id}
        open={Boolean(lead360Id)}
        initialTab={lead360Tab}
        onClose={() => {
          setLead360Id(null);
          setLead360Tab("overview");
        }}
      />

      <LeadsCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        isPending={commands.create.isPending}
        stageOptions={stageOptions}
        ownerOptions={ownerOptions}
        sourceOptions={sourceOptions}
        defaultOwnerId={user?.id}
        defaultStageId={createStageId}
        onSubmit={async (draft) => {
          await commands.create.mutateAsync({
            name: draft.name.trim(),
            contactPerson: draft.contactPerson.trim() || draft.name.trim(),
            email: draft.email.trim() || undefined,
            phone: draft.phone.trim() || undefined,
            companyName: draft.companyName.trim() || undefined,
            stageId: draft.stageId || createStageId,
            ownerId: draft.ownerId || undefined,
            sourceId: draft.sourceId || undefined,
            expectedValue: draft.expectedValue ? Number(draft.expectedValue) : undefined,
            expectedCloseDate: draft.expectedCloseDate || null,
            priority: draft.priority || undefined,
            temperature: draft.temperature || null,
            notes: draft.notes || undefined,
            tags: draft.tags,
            pipelineId: pipelineId ?? undefined,
            currency: getCompanyCurrency(),
          });
          setCreateOpen(false);
          toast({ title: t("leads.workspace.createSuccess") });
        }}
      />

      <LeadsCreateDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditLead(null);
        }}
        mode="edit"
        seedKey={editLead?.id ?? null}
        initialDraft={editLead ? leadToFormDraft(editLead) : null}
        isPending={commands.update.isPending}
        stageOptions={stageOptions}
        ownerOptions={ownerOptions}
        sourceOptions={sourceOptions}
        onSubmit={async (draft) => {
          if (!editLead) return;
          try {
            await commands.update.mutateAsync({
              leadId: editLead.id,
              ...leadFormDraftToUpdatePatch(draft),
            });
            setEditOpen(false);
            setEditLead(null);
            toast({ title: t("leads.workspace.editSuccess") });
          } catch (error) {
            toast({
              title: t("leads.workspace.editFailed"),
              description: error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
            throw error;
          }
        }}
      />

      <Opportunity360Workspace
        opportunityId={opportunityId}
        open={Boolean(opportunityId)}
        onOpenChange={(next) => {
          if (!next) setOpportunityId(null);
        }}
      />
    </div>
  );
}
