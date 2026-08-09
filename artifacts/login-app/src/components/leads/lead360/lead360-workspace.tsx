import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, BriefcaseBusiness, FileText, ListTodo, Loader2, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LeadReadModel, OpportunityReadModel } from "@workspace/application-layer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ENTITY_360_DIALOG_CONTENT_CLASS,
  ENTITY_360_TAB_TRIGGER_CLASS,
  ENTITY_360_TABS_LIST_CLASS,
} from "@/components/entity-workspace/entity-360-dialog-shell";
import { useLead360Workspace } from "@/hooks/leads/use-lead360-workspace";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { OpportunityCreateDialog } from "@/components/opportunities/opportunity-create-dialog";
import {
  isLeadAlreadyConverted,
  isLeadEligibleForOpportunityCreation,
} from "@/components/leads/crm/leads-crm-row-actions";
import { leadReadModelToOpportunitySeed } from "@/components/opportunities/opportunity-form-draft";
import {
  formatOpportunityDate,
  formatOpportunityMoney,
} from "@/components/opportunities/opportunity360-ui";
import { useExistingOpportunityForLead } from "@/hooks/opportunities/use-opportunity-create-form-options";
import {
  resolveOpportunityStageLabel,
  useActiveOpportunityPipelineId,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { cn } from "@/lib/utils";
import { Lead360Header } from "./lead360-header";
import { Lead360SmartRail } from "./lead360-smart-rail";
import { Lead360AiWorkspace } from "./lead360-ai-workspace";
import { Lead360ConversationTab } from "./lead360-conversation-tab";
import { Lead360TimelineTab } from "./lead360-timeline-tab";
import { Lead360Skeleton } from "./lead360-ui";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { formatBillingCurrency } from "@/lib/billing/format";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import {
  localizeLeadChannel,
  localizeLeadTaskStatus,
  localizeOpportunityPipelineName,
  localizeOpportunityStageName,
} from "./lead360-localize";

type Lead360Tab =
  | "overview"
  | "conversation"
  | "activity"
  | "tasks"
  | "timeline"
  | "ai"
  | "files"
  | "audit";

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function OverviewField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  const display = value == null || value === "" ? "—" : value;
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">{display}</div>
    </div>
  );
}

function Lead360AssociatedOpportunity({
  opportunity,
  locale,
  onOpen,
}: {
  opportunity: OpportunityReadModel;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation("common");
  const pipelineContext = useOpportunityPipelineContext(opportunity.pipelineId);
  const { pipelines } = useActiveOpportunityPipelineId();
  const pipelineName = localizeOpportunityPipelineName(
    t,
    pipelines.find((pipeline) => pipeline.id === opportunity.pipelineId)?.name ?? null,
  );
  const stageLabel =
    localizeOpportunityStageName(
      t,
      resolveOpportunityStageLabel(
        pipelineContext.stageById,
        opportunity.stageId,
        opportunity.stage,
      ),
    ) || "—";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("opportunities360.associatedOpportunity.title")}
          </p>
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {opportunity.name}
          </p>
        </div>
        <Button type="button" size="sm" className="shrink-0 rounded-lg" onClick={onOpen}>
          {t("opportunities360.associatedOpportunity.open")}
        </Button>
      </div>
      <div className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
        <OverviewField label={t("opportunities360.fields.company")} value={opportunity.companyName} />
        <OverviewField
          label={t("opportunities360.fields.primaryContact")}
          value={opportunity.primaryContact}
        />
        <OverviewField
          label={t("opportunities360.fields.amount")}
          value={formatOpportunityMoney(opportunity.expectedRevenue, opportunity.currency)}
        />
        <OverviewField label={t("opportunities360.fields.pipeline")} value={pipelineName} />
        <OverviewField label={t("opportunities360.fields.stage")} value={stageLabel} />
        <OverviewField label={t("opportunities360.fields.owner")} value={opportunity.owner} />
        <OverviewField
          label={t("opportunities360.fields.expectedCloseDate")}
          value={formatOpportunityDate(opportunity.expectedCloseDate, locale) || null}
        />
      </div>
    </section>
  );
}

function Lead360OverviewGrid({
  lead,
  companyCurrency,
  locale,
  associatedOpportunity,
  onOpenOpportunity,
}: {
  lead: LeadReadModel;
  companyCurrency: string;
  locale: string;
  associatedOpportunity: OpportunityReadModel | null;
  onOpenOpportunity: (opportunityId: string) => void;
}) {
  const { t } = useTranslation("common");
  const stageLabel = translateLeadStageLabel(t, {
    name: lead.stage,
    lifecycleStatus: lead.lifecycleStatus,
    slug: lead.stage,
  });
  const displayName = lead.contactPerson || lead.name;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {associatedOpportunity ? (
        <Lead360AssociatedOpportunity
          opportunity={associatedOpportunity}
          locale={locale}
          onOpen={() => onOpenOpportunity(associatedOpportunity.id)}
        />
      ) : null}

      <section className="rounded-2xl border border-border/40 bg-muted/10 p-4 sm:p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("leads360.tabs.overview")}
        </h3>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewField label={t("leads.columns.customerName")} value={displayName} />
          <OverviewField label={t("leads.columns.company")} value={lead.companyName} />
          <OverviewField label={t("leads.columns.email")} value={lead.email} />
          <OverviewField label={t("leads.columns.mobile")} value={lead.phone} />
          <OverviewField label={t("leads.columns.owner")} value={lead.owner} />
          <OverviewField label={t("leads.columns.stage")} value={stageLabel} />
          <OverviewField label={t("leads.columns.source")} value={lead.source} />
          <OverviewField
            label={t("leads.columns.priority")}
            value={t(`leads.workspace.priority.${lead.priority}`)}
          />
          <OverviewField
            label={t("leads360.ai.temperature")}
            value={lead.temperature ? t(`leads.scoreBand.${lead.temperature}`) : null}
          />
          <OverviewField
            label={t("leads.columns.expectedValue")}
            value={
              lead.expectedValue != null
                ? formatBillingCurrency(lead.expectedValue, companyCurrency)
                : null
            }
          />
          <OverviewField
            label={t("leads.workspace.fields.expectedCloseDate")}
            value={formatDate(lead.expectedCloseDate, locale)}
          />
          <OverviewField
            label={t("leads.workspace.fields.created")}
            value={formatDateTime(lead.createdAt, locale)}
          />
          <OverviewField
            label={t("leads.workspace.fields.lastActivity")}
            value={formatDateTime(lead.lastActivityAt, locale)}
          />
          <OverviewField
            label={t("leads.workspace.fields.contactPerson")}
            value={lead.contactPerson}
          />
        </div>
      </section>

      {lead.tags.length > 0 ? (
        <section className="rounded-2xl border border-border/40 bg-muted/10 p-4 sm:p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("leads.workspace.fields.tags")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-background/80 px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border/50"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {lead.notes.trim() ? (
        <section className="rounded-2xl border border-border/40 bg-muted/10 p-4 sm:p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("leads.workspace.panel.notes")}
          </h3>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
            {lead.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function Lead360Workspace({
  leadId,
  open,
  onClose,
  initialTab,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  initialTab?: Lead360Tab;
}) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { currency: companyCurrency } = useCompanyLocaleContext();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { data, isLoading } = useLead360Workspace(leadId);
  const commands = useLeadCommands();
  const associatedOpportunityQuery = useExistingOpportunityForLead(leadId, open);
  const [createdOpportunityId, setCreatedOpportunityId] = useState<string | null>(null);
  const [createOpportunityOpen, setCreateOpportunityOpen] = useState(false);
  const [tab, setTab] = useState<Lead360Tab>(initialTab ?? "overview");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "overview");
  }, [open, leadId, initialTab]);

  const lead = data?.lead;
  const associatedOpportunity = associatedOpportunityQuery.data ?? null;
  const alreadyConverted = lead
    ? isLeadAlreadyConverted({
        customerId: lead.customerId,
        lifecycleStatus: lead.lifecycleStatus,
      })
    : false;
  const canCreateOpportunity =
    Boolean(lead) &&
    !associatedOpportunity &&
    (isSuperAdmin || hasPermission("opportunities.convert")) &&
    isLeadEligibleForOpportunityCreation({
      isQualified: lead!.isQualified,
      customerId: lead!.customerId,
      lifecycleStatus: lead!.lifecycleStatus,
    });
  const canConvert = Boolean(lead) && !alreadyConverted;

  const activities = data?.activities ?? [];
  const tasks = data?.tasks ?? [];
  const files = data?.files ?? [];
  const timeline = data?.timeline ?? [];
  const aiStatus = data?.aiStatus ?? lead?.aiStatus;
  const conversationFeed = useMemo(
    () =>
      [...activities].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    [activities],
  );

  const tabs: Array<[Lead360Tab, string]> = [
    ["overview", t("leads360.tabs.overview")],
    ["conversation", t("leads360.tabs.conversation")],
    ["activity", t("leads360.tabs.activity")],
    ["tasks", t("leads360.tabs.tasks")],
    ["timeline", t("leads360.tabs.timeline")],
    ["ai", t("leads360.tabs.ai")],
    ["files", t("leads360.tabs.files")],
    ["audit", t("leads360.tabs.audit")],
  ];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setTab("overview");
            onClose();
          }
        }}
      >
        <DialogContent className={cn(ENTITY_360_DIALOG_CONTENT_CLASS)}>
          <DialogTitle className="sr-only">{t("leads.workspace.panelTitle")}</DialogTitle>

          {isLoading || !lead ? (
            <Lead360Skeleton />
          ) : (
            <>
              <Lead360Header lead={lead} panel={data?.aiPanel} onClose={onClose} />

              <section className="shrink-0 border-b border-border/60 bg-muted/15 px-5 py-4 lg:hidden sm:px-7">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("leads360.summary")}
                </p>
                <Lead360SmartRail lead={lead} panel={data?.aiPanel} compact />
              </section>

              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as Lead360Tab)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className={ENTITY_360_TABS_LIST_CLASS}>
                  {tabs.map(([id, label]) => (
                    <TabsTrigger key={id} value={id} className={cn(ENTITY_360_TAB_TRIGGER_CLASS)}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex min-h-0 flex-1 gap-0 overflow-hidden bg-muted/5">
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                    <TabsContent value="overview" className="mt-0">
                      {tab === "overview" ? (
                        <Lead360OverviewGrid
                          lead={lead}
                          companyCurrency={companyCurrency}
                          locale={i18n.language}
                          associatedOpportunity={associatedOpportunity}
                          onOpenOpportunity={(id) => setCreatedOpportunityId(id)}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="conversation" className="mt-0">
                      {tab === "conversation" ? (
                        <Lead360ConversationTab
                          activities={conversationFeed}
                          panel={data?.aiPanel}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="activity" className="mt-0 space-y-3">
                      {tab === "activity" ? (
                        activities.length === 0 ? (
                          <EnterpriseEmptyState
                            compact
                            icon={<ListTodo className="size-6" aria-hidden />}
                            title={t("leads360.empty.activityTitle")}
                            description={t("leads360.empty.activity")}
                          />
                        ) : (
                          activities.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-border/40 bg-card/40 px-4 py-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[13px] font-medium">{item.subject}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {formatDateTime(item.occurredAt, i18n.language)}
                                </div>
                              </div>
                              <div className="mt-1 text-[12px] text-muted-foreground">
                                {localizeLeadChannel(t, item.channel)}
                                {item.actor ? ` · ${item.actor}` : ""}
                              </div>
                              {item.preview ? (
                                <p className="mt-2 text-[13px] text-foreground/85">{item.preview}</p>
                              ) : null}
                            </div>
                          ))
                        )
                      ) : null}
                    </TabsContent>

                    <TabsContent value="tasks" className="mt-0 space-y-3">
                      {tab === "tasks" ? (
                        tasks.length === 0 ? (
                          <EnterpriseEmptyState
                            compact
                            icon={<FileText className="size-6" aria-hidden />}
                            title={t("leads360.empty.tasksTitle")}
                            description={t("leads360.empty.tasks")}
                          />
                        ) : (
                          tasks.map((task) => (
                            <div
                              key={task.id}
                              className="rounded-xl border border-border/40 bg-card/40 px-4 py-3"
                            >
                              <div className="text-[13px] font-medium">{task.title}</div>
                              <div className="mt-1 text-[12px] text-muted-foreground">
                                {localizeLeadTaskStatus(t, task.status)} · {task.assignee}
                                {task.dueAt
                                  ? ` · ${formatDateTime(task.dueAt, i18n.language)}`
                                  : ""}
                              </div>
                            </div>
                          ))
                        )
                      ) : null}
                    </TabsContent>

                    <TabsContent value="timeline" className="mt-0">
                      {tab === "timeline" ? (
                        <Lead360TimelineTab
                          timeline={timeline}
                          aiAudit={data?.aiAudit}
                          panel={data?.aiPanel}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="ai" className="mt-0">
                      {tab === "ai" && leadId ? (
                        <Lead360AiWorkspace
                          leadId={leadId}
                          aiStatus={aiStatus}
                          aiAudit={data?.aiAudit}
                          panel={data?.aiPanel}
                        />
                      ) : null}
                    </TabsContent>

                    <TabsContent value="files" className="mt-0 space-y-3">
                      {tab === "files" ? (
                        files.length === 0 ? (
                          <EnterpriseEmptyState
                            compact
                            icon={<Paperclip className="size-6" aria-hidden />}
                            title={t("leads360.empty.filesTitle")}
                            description={t("leads360.empty.filesDescription")}
                          />
                        ) : (
                          files.map((file) => (
                            <div
                              key={file.id}
                              className="rounded-xl border border-border/40 bg-card/40 px-4 py-3"
                            >
                              <div className="text-[13px] font-medium">{file.fileName}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {file.mimeType} · {formatDateTime(file.uploadedAt, i18n.language)}
                              </div>
                            </div>
                          ))
                        )
                      ) : null}
                    </TabsContent>

                    <TabsContent value="audit" className="mt-0">
                      {tab === "audit" ? (
                        <Lead360TimelineTab
                          timeline={timeline}
                          aiAudit={data?.aiAudit}
                          panel={null}
                        />
                      ) : null}
                    </TabsContent>
                  </div>

                  <div className="hidden shrink-0 border-s border-border/50 bg-muted/10 p-5 lg:block lg:w-[300px] xl:w-[320px]">
                    <Lead360SmartRail lead={lead} panel={data?.aiPanel} />
                  </div>
                </div>
              </Tabs>

              {canCreateOpportunity || canConvert ? (
                <div className="shrink-0 space-y-2 border-t border-border/60 bg-background px-5 py-4 sm:px-7">
                  {canCreateOpportunity ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 w-full gap-2 rounded-xl text-[13px] font-semibold"
                      disabled={!leadId}
                      onClick={() => setCreateOpportunityOpen(true)}
                    >
                      <BriefcaseBusiness className="size-4" />
                      {t("leads360.createOpportunity")}
                    </Button>
                  ) : null}
                  {canConvert ? (
                    <Button
                      type="button"
                      className="h-11 w-full gap-2 rounded-xl text-[13px] font-semibold"
                      disabled={commands.convert.isPending || !leadId}
                      onClick={() => {
                        if (!leadId) return;
                        void commands.convert
                          .mutateAsync({ leadId })
                          .then((result) => {
                            toast({ title: t("leads.kanban.actions.converted") });
                            if (result.opportunityId) {
                              setCreatedOpportunityId(result.opportunityId);
                            }
                          })
                          .catch((error: unknown) => {
                            toast({
                              title: t("leads.kanban.actions.convertFailed"),
                              description: resolveApplicationErrorMessage(error),
                              variant: "destructive",
                            });
                          });
                      }}
                    >
                      {commands.convert.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {t("leads360.convert")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>

      {lead ? (
        <OpportunityCreateDialog
          open={createOpportunityOpen}
          onOpenChange={setCreateOpportunityOpen}
          source={{ mode: "fromLead", lead: leadReadModelToOpportunitySeed(lead) }}
          onOpenExisting={(id) => {
            setCreateOpportunityOpen(false);
            setCreatedOpportunityId(id);
          }}
          onCreated={(id) => {
            toast({ title: t("opportunities.created") });
            setCreatedOpportunityId(id);
          }}
        />
      ) : null}
      <Opportunity360Workspace
        opportunityId={createdOpportunityId}
        open={Boolean(createdOpportunityId)}
        onOpenChange={(next) => {
          if (!next) setCreatedOpportunityId(null);
        }}
        onOpenLead={(_leadId, intent) => {
          setCreatedOpportunityId(null);
          if (intent === "activity") setTab("activity");
        }}
      />
    </>
  );
}
