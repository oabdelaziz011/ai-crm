import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import {
  useLeadDashboardMetrics,
  useLeadPipelines,
  useLeadSources,
  useLeadStages,
  useLeadsQueue,
} from "@/hooks/leads/use-leads-workspace";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { Lead360Workspace } from "@/components/leads/lead360/lead360-workspace";
import {
  LeadsCreateDialog,
  type LeadsCreateOption,
} from "@/components/leads/workspace/leads-create-dialog";
import {
  leadFormDraftToUpdatePatch,
  leadToFormDraft,
} from "@/components/leads/workspace/leads-form-draft";
import { LeadsCrmTopBar } from "@/components/leads/crm/leads-crm-topbar";
import {
  buildLeadsCrmMetrics,
  LeadsCrmMetricsRow,
  type LeadsCrmMetricId,
} from "@/components/leads/crm/leads-crm-metrics";
import {
  LeadsCrmTable,
  type LeadContactColumnFilters,
  type LeadContactSortState,
} from "@/components/leads/crm/leads-crm-table";
import type { LeadTableActionId } from "@/components/leads/crm/leads-crm-row-actions";
import {
  externalWhatsAppUrl,
} from "@/components/leads/crm/leads-crm-whatsapp";
import {
  LeadsAssignOwnerDialog,
  LeadsCreateActivityDialog,
  LeadsDeleteConfirmDialog,
} from "@/components/leads/crm/leads-crm-action-dialogs";
import { executeLeadTableAction } from "@/components/leads/crm/leads-crm-action-handler";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { OpportunityCreateDialog } from "@/components/opportunities/opportunity-create-dialog";
import { leadWorkspaceRowToOpportunitySeed } from "@/components/opportunities/opportunity-form-draft";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { useAuth } from "@/context/auth-context";
import { useConversationServices } from "@/lib/ai-conversation";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import {
  ConversationService,
  getTeamInboxDashboardHref,
  queueTeamInboxConversationFocus,
} from "@/lib/customer-profile/services";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";
import { isWhatsAppCompanyChannel } from "@/lib/omnichannel/tenant/diagnose-inbox-empty-state";
import { supabase } from "@/lib/supabase";

function exportLeadsCsv(rows: LeadWorkspaceRow[], filename: string) {
  const headers = [
    "name",
    "contactPerson",
    "companyName",
    "stage",
    "owner",
    "source",
    "priority",
    "expectedValue",
    "currency",
    "email",
    "phone",
    "lastActivityAt",
    "createdAt",
  ];
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.contactPerson,
        row.companyName,
        row.stage,
        row.owner,
        row.source,
        row.priority,
        row.expectedValue,
        row.currency,
        row.email,
        row.phone,
        row.lastActivityAt,
        row.createdAt,
      ]
        .map(escape)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Full-width CRM workspace composition.
 * Header → 6 metric cards → full-width table → Lead360 dialog.
 * No sidebar / dashboard panels.
 */
export function LeadsTablePage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const [, setLocation] = useLocation();
  const canCreate = isSuperAdmin || hasPermission("leads.create");
  const commands = useLeadCommands();
  const opportunityCommands = useOpportunityCommands();

  const tablePermissions = useMemo(
    () => ({
      canView: isSuperAdmin || hasPermission("leads.view"),
      canEdit: isSuperAdmin || hasPermission("leads.edit"),
      canAssign: isSuperAdmin || hasPermission("leads.assign"),
      canCreateOpportunity: isSuperAdmin || hasPermission("opportunities.convert"),
      canConvert: isSuperAdmin || hasPermission("leads.convert"),
      canArchive: isSuperAdmin || hasPermission("leads.archive"),
      canDelete: isSuperAdmin || hasPermission("leads.delete"),
    }),
    [hasPermission, isSuperAdmin],
  );

  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadWorkspaceRow | null>(null);
  const [lead360Tab, setLead360Tab] = useState<"overview" | "activity" | "ai">("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLead, setEditLead] = useState<LeadWorkspaceRow | null>(null);
  const [activeMetricId, setActiveMetricId] = useState<LeadsCrmMetricId>("all");
  const [lifecycleStatus, setLifecycleStatus] = useState<string | undefined>();
  const [actionLead, setActionLead] = useState<LeadWorkspaceRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [createOpportunityOpen, setCreateOpportunityOpen] = useState(false);
  const [createOpportunityLead, setCreateOpportunityLead] = useState<LeadWorkspaceRow | null>(null);
  const [contactSort, setContactSort] = useState<LeadContactSortState>(null);
  const [contactFilters, setContactFilters] = useState<LeadContactColumnFilters>({
    customerName: "",
    email: "",
    mobile: "",
  });
  const { data: companyChannels = [] } = useCompanyChannelsAdmin();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const hasWhatsAppIntegration = useMemo(
    () => companyChannels.some(isWhatsAppCompanyChannel),
    [companyChannels],
  );
  const whatsAppChannelId = useMemo(
    () => companyChannels.find(isWhatsAppCompanyChannel)?.id ?? null,
    [companyChannels],
  );

  const openLead360 = (row: LeadWorkspaceRow, tab: "overview" | "activity" | "ai" = "overview") => {
    setLead360Tab(tab);
    setSelectedLead(row);
  };

  const failToast = (title: string, error?: unknown) => {
    toast({
      title,
      description: error ? resolveApplicationErrorMessage(error) : undefined,
      variant: "destructive",
    });
  };

  const { data: pipelines } = useLeadPipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const { data: metrics } = useLeadDashboardMetrics();
  const { data: stages } = useLeadStages(pipelineId);
  const { data: sources } = useLeadSources();
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

  const { data, isLoading } = useLeadsQueue({
    search: search || undefined,
    lifecycleStatus,
    pipelineId: pipelineId ?? undefined,
    limit: 100,
  });

  const rows = useMemo(() => {
    const base = data?.rows ?? [];
    const nameFilter = contactFilters.customerName.trim().toLowerCase();
    const emailFilter = contactFilters.email.trim().toLowerCase();
    const mobileFilter = contactFilters.mobile.trim().toLowerCase();

    const filtered = base.filter((row) => {
      if (nameFilter && !row.name.toLowerCase().includes(nameFilter)) return false;
      if (emailFilter && !(row.email ?? "").toLowerCase().includes(emailFilter)) return false;
      if (mobileFilter && !(row.phone ?? "").toLowerCase().includes(mobileFilter)) return false;
      return true;
    });

    if (!contactSort) return filtered;

    const direction = contactSort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const valueOf = (row: LeadWorkspaceRow) => {
        if (contactSort.column === "customerName") return row.name ?? "";
        if (contactSort.column === "email") return row.email ?? "";
        return row.phone ?? "";
      };
      return valueOf(a).localeCompare(valueOf(b), undefined, { sensitivity: "base" }) * direction;
    });
  }, [contactFilters, contactSort, data]);

  const crmMetrics = useMemo(
    () =>
      buildLeadsCrmMetrics(
        metrics?.leadsByStatus as Record<string, number> | undefined,
        metrics?.totalLeads ?? data?.total ?? rows.length,
      ),
    [metrics, data?.total, rows.length],
  );

  const stageOptions = useMemo((): LeadsCreateOption[] => {
    if (stages?.length) {
      return stages.map((stage) => ({ id: stage.id, label: stage.name }));
    }
    return [];
  }, [stages]);

  const ownerOptions = useMemo((): LeadsCreateOption[] => {
    const map = new Map<string, string>();
    // assigned_user_id is auth.users id — only use identities with userId.
    for (const owner of companyOwners ?? []) {
      if (!owner.userId) continue;
      map.set(owner.userId, owner.fullName);
    }
    if (user?.id && !map.has(user.id)) {
      const selfName =
        (user as { user_metadata?: { full_name?: string } } | null)?.user_metadata?.full_name ||
        user.email ||
        t("leads.columns.owner");
      map.set(user.id, selfName);
    }
    for (const row of rows) {
      if (row.ownerId && row.owner) map.set(row.ownerId, row.owner);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [companyOwners, rows, t, user]);

  const sourceOptions = useMemo((): LeadsCreateOption[] => {
    if (sources?.length) {
      return sources.map((source) => ({ id: source.id, label: source.name }));
    }
    return [];
  }, [sources]);

  const ownersByUserId = useMemo(() => {
    const map = new Map<string, EmployeeIdentity>();
    for (const owner of companyOwners ?? []) {
      if (owner.userId) map.set(owner.userId, owner);
    }
    return map;
  }, [companyOwners]);

  const handleRowAction = (action: LeadTableActionId, row: LeadWorkspaceRow) => {
    void executeLeadTableAction(action, {
      row,
      t,
      toast,
      failToast,
      commands,
      openLead360,
      setOpportunityId,
      openCreateOpportunityDialog: (leadRow) => {
        setCreateOpportunityLead(leadRow);
        setCreateOpportunityOpen(true);
      },
      setEditLead,
      setEditOpen,
      setActionLead,
      setAssignOpen,
      setActivityOpen,
      setDeleteOpen,
      setSelectedLead,
      whatsApp: {
        hasIntegration: hasWhatsAppIntegration,
        channelId: whatsAppChannelId,
        companyId: company?.id,
        openPlatform: async ({ customerId, phone, leadId }) => {
          if (customerId) {
            try {
              await ConversationService.openWhatsappConversation({
                customerId,
                companyId: company?.id,
                navigate: setLocation,
              });
              return;
            } catch (error) {
              if (!(error instanceof Error) || error.message !== "WHATSAPP_CONVERSATION_NOT_FOUND") {
                throw error;
              }
            }
          }

          if (!company?.id || !whatsAppChannelId) {
            window.open(externalWhatsAppUrl(phone), "_blank");
            return;
          }

          const { data: assistant, error: assistantError } = await supabase
            .from("ai_assistant_settings")
            .select("id")
            .eq("company_id", company.id)
            .is("deleted_at", null)
            .maybeSingle();
          if (assistantError) throw new Error(assistantError.message);
          if (!assistant?.id) {
            window.open(externalWhatsAppUrl(phone), "_blank");
            return;
          }

          const created = await conversationServices.conversations.createConversation(
            conversationContext,
            {
              companyId: company.id,
              aiAssistantId: assistant.id,
              channelType: "whatsapp",
              companyChannelId: whatsAppChannelId,
              customerId: customerId ?? undefined,
              metadata: {
                phone,
                leadId,
                source: "leads_table",
              },
            },
          );
          queueTeamInboxConversationFocus(created.id);
          setLocation(getTeamInboxDashboardHref());
        },
      },
    });
  };

  if (isLoading && !data) return <DashboardPageFallback />;

  return (
    <div data-leads-ui="crm-fullwidth" className="flex w-full flex-col gap-4">
      <LeadsCrmTopBar
        search={search}
        onSearchChange={setSearch}
        canCreate={canCreate}
        onCreate={() => setCreateOpen(true)}
        onImport={() =>
          toast({
            title: t("leads.workspace.import"),
            description: t("leads.workspace.importHint"),
          })
        }
        onExport={() => {
          exportLeadsCsv(rows, `leads-${new Date().toISOString().slice(0, 10)}.csv`);
          toast({ title: t("leads.workspace.exportDone", { count: rows.length }) });
        }}
      />

      <LeadsCrmMetricsRow
        metrics={crmMetrics}
        activeId={activeMetricId}
        onChange={(metric) => {
          setActiveMetricId(metric.id);
          setLifecycleStatus(metric.lifecycleStatus ?? undefined);
        }}
      />

      <LeadsCrmTable
        rows={rows}
        selectedLeadId={selectedLead?.id ?? null}
        ownersByUserId={ownersByUserId}
        permissions={tablePermissions}
        contactSort={contactSort}
        onContactSortChange={setContactSort}
        contactFilters={contactFilters}
        onContactFiltersChange={setContactFilters}
        onSelect={(row) => openLead360(row, "overview")}
        onCreate={() => setCreateOpen(true)}
        canCreate={canCreate}
        onCompanyOpen={() => {
          setLocation(companyWorkspaceHref("overview"));
        }}
        onOwnerOpen={() => {
          setLocation(companyWorkspaceHref("employees"));
        }}
        onRowAction={handleRowAction}
      />

      <Lead360Workspace
        leadId={selectedLead?.id ?? null}
        open={Boolean(selectedLead)}
        initialTab={lead360Tab}
        onClose={() => {
          setSelectedLead(null);
          setLead360Tab("overview");
        }}
      />

      <Opportunity360Workspace
        opportunityId={opportunityId}
        open={Boolean(opportunityId)}
        onOpenChange={(next) => {
          if (!next) setOpportunityId(null);
        }}
        onOpenLead={(leadId, intent) => {
          setOpportunityId(null);
          const row = rows.find((r) => r.id === leadId);
          if (row) openLead360(row, intent === "activity" ? "activity" : "overview");
        }}
      />

      <OpportunityCreateDialog
        open={createOpportunityOpen}
        onOpenChange={(open) => {
          setCreateOpportunityOpen(open);
          if (!open) setCreateOpportunityLead(null);
        }}
        source={
          createOpportunityLead
            ? { mode: "fromLead", lead: leadWorkspaceRowToOpportunitySeed(createOpportunityLead) }
            : { mode: "manual" }
        }
        onOpenExisting={(id) => {
          setCreateOpportunityOpen(false);
          setCreateOpportunityLead(null);
          setOpportunityId(id);
        }}
        onCreated={(id) => {
          toast({ title: t("leads.kanban.actions.opportunityCreated") });
          setOpportunityId(id);
          setCreateOpportunityLead(null);
        }}
      />

      <LeadsAssignOwnerDialog
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open);
          if (!open) setActionLead(null);
        }}
        leadName={actionLead?.name ?? ""}
        ownerOptions={ownerOptions}
        currentOwnerId={actionLead?.ownerId}
        isPending={commands.assign.isPending}
        onConfirm={(ownerId) => {
          if (!actionLead) return;
          void commands.assign
            .mutateAsync({ leadId: actionLead.id, ownerId })
            .then(() => {
              toast({ title: t("leads.kanban.context.assigned") });
              setAssignOpen(false);
              setActionLead(null);
            })
            .catch((error: Error) => failToast(t("leads.table.errors.assignFailed"), error));
        }}
      />

      <LeadsCreateActivityDialog
        open={activityOpen}
        onOpenChange={(open) => {
          setActivityOpen(open);
          if (!open) setActionLead(null);
        }}
        leadName={actionLead?.name ?? ""}
        isPending={commands.update.isPending}
        onConfirm={(body) => {
          if (!actionLead) return;
          const stamp = new Date().toISOString();
          const previous = actionLead.notes?.trim() ?? "";
          const nextNotes = previous
            ? `${previous}\n\n[${stamp}] ${body}`
            : `[${stamp}] ${body}`;
          void commands.update
            .mutateAsync({ leadId: actionLead.id, notes: nextNotes })
            .then(() => {
              toast({ title: t("leads.table.activityCreated") });
              setActivityOpen(false);
              const lead = actionLead;
              setActionLead(null);
              openLead360(lead, "activity");
            })
            .catch((error: Error) => failToast(t("leads.table.errors.activityFailed"), error));
        }}
      />

      <LeadsDeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setActionLead(null);
        }}
        leadName={actionLead?.name ?? ""}
        isPending={commands.archive.isPending}
        onConfirm={() => {
          if (!actionLead) return;
          const leadId = actionLead.id;
          void commands.archive
            .mutateAsync({ leadId })
            .then(() => {
              toast({ title: t("leads.table.rowActions.deleted") });
              setDeleteOpen(false);
              setActionLead(null);
              setSelectedLead((current) => (current?.id === leadId ? null : current));
            })
            .catch((error: Error) => failToast(t("leads.table.errors.deleteFailed"), error));
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
        onSubmit={async (draft) => {
          try {
            await commands.create.mutateAsync({
              name: draft.name.trim(),
              contactPerson: draft.contactPerson.trim() || draft.name.trim(),
              email: draft.email.trim() || undefined,
              phone: draft.phone.trim() || undefined,
              companyName: draft.companyName.trim() || undefined,
              stageId: draft.stageId || undefined,
              ownerId: draft.ownerId || undefined,
              sourceId: draft.sourceId || undefined,
              priority: draft.priority || undefined,
              expectedValue: draft.expectedValue.trim()
                ? Number(draft.expectedValue)
                : undefined,
              expectedCloseDate: draft.expectedCloseDate.trim() || null,
              temperature: draft.temperature || null,
              tags: draft.tags,
              notes: draft.notes.trim() || undefined,
              pipelineId: pipelineId ?? undefined,
            });
            setCreateOpen(false);
            toast({ title: t("leads.workspace.createSuccess") });
          } catch (error) {
            toast({
              title: t("leads.workspace.createFailed"),
              description: error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
            throw error;
          }
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
    </div>
  );
}

export default LeadsTablePage;
