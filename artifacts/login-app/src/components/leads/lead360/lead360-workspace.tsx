import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, BriefcaseBusiness, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLead360Workspace } from "@/hooks/leads/use-lead360-workspace";
import { useLeadCommands } from "@/hooks/leads/use-lead-commands";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { FileText, ListTodo, Paperclip } from "lucide-react";
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

function Property({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border/40 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div className="text-[13px] font-medium text-foreground">{value || "—"}</div>
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
  const opportunityCommands = useOpportunityCommands();
  const [createdOpportunityId, setCreatedOpportunityId] = useState<string | null>(null);
  const [tab, setTab] = useState<Lead360Tab>(initialTab ?? "ai");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "ai");
  }, [open, leadId, initialTab]);

  const lead = data?.lead;

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
    ["overview", t("leads360.sections.overview")],
    ["conversation", t("leads360.tabs.conversation", { defaultValue: "Conversation" })],
    ["activity", t("leads360.tabs.activity")],
    ["tasks", t("leads360.sections.tasks")],
    ["timeline", t("leads360.tabs.timeline", { defaultValue: "Timeline" })],
    ["ai", t("leads360.tabs.ai", { defaultValue: "AI" })],
    ["files", t("leads360.sections.files")],
    ["audit", t("leads360.tabs.audit", { defaultValue: "Audit" })],
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTab("ai");
          onClose();
        }
      }}
    >
      <DialogContent
        className={cn(
          "flex h-[min(92vh,960px)] w-[calc(100vw-1rem)] max-w-[1280px] flex-col gap-0 overflow-hidden rounded-2xl p-0",
          "sm:max-w-[1280px] [&>button]:hidden",
        )}
      >
        <DialogTitle className="sr-only">{t("leads.workspace.panelTitle")}</DialogTitle>

        {isLoading || !lead ? (
          <Lead360Skeleton />
        ) : (
          <>
            <Lead360Header lead={lead} panel={data?.aiPanel} onClose={onClose} />

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as Lead360Tab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="h-auto w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-transparent p-0 px-4 sm:px-6">
                {tabs.map(([id, label]) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      "rounded-none border-b-2 border-transparent px-3 py-3 text-[13px]",
                      "data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                      id === "ai" && "font-semibold",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                  <TabsContent value="overview" className="mt-0 space-y-1">
                    {tab === "overview" ? (
                      <>
                        <Property label={t("leads.workspace.fields.leadName")} value={lead.name} />
                        <Property
                          label={t("leads.workspace.fields.contactPerson")}
                          value={lead.contactPerson}
                        />
                        <Property label={t("leads.workspace.fields.company")} value={lead.companyName} />
                        <Property label={t("leads.workspace.fields.email")} value={lead.email} />
                        <Property label={t("leads.workspace.fields.phone")} value={lead.phone} />
                        <Property label={t("leads.columns.owner")} value={lead.owner} />
                        <Property
                          label={t("leads.columns.stage")}
                          value={translateLeadStageLabel(t, {
                            name: lead.stage,
                            lifecycleStatus: lead.lifecycleStatus,
                            slug: lead.stage,
                          })}
                        />
                        <Property label={t("leads.columns.source")} value={lead.source} />
                        <Property
                          label={t("leads.columns.priority")}
                          value={t(`leads.workspace.priority.${lead.priority}`)}
                        />
                        <Property
                          label={t("leads.workspace.fields.temperature")}
                          value={
                            lead.temperature ? t(`leads.scoreBand.${lead.temperature}`) : null
                          }
                        />
                        <Property
                          label={t("leads.columns.expectedValue")}
                          value={
                            lead.expectedValue != null
                              ? formatBillingCurrency(lead.expectedValue, companyCurrency)
                              : null
                          }
                        />
                        <Property
                          label={t("leads.workspace.fields.expectedCloseDate")}
                          value={formatDate(lead.expectedCloseDate, i18n.language)}
                        />
                        <Property
                          label={t("leads.workspace.fields.tags")}
                          value={
                            lead.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {lead.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-sm bg-muted px-2 py-1 text-[12px] font-medium"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null
                          }
                        />
                        <Property
                          label={t("leads.workspace.fields.lastActivity")}
                          value={formatDateTime(lead.lastActivityAt, i18n.language)}
                        />
                        <Property
                          label={t("leads.workspace.fields.created")}
                          value={formatDateTime(lead.createdAt, i18n.language)}
                        />
                        <Property
                          label={t("leads.workspace.panel.notes")}
                          value={lead.notes.trim() || null}
                        />
                      </>
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
                          title={t("leads360.empty.activityTitle", {
                            defaultValue: "No activities yet",
                          })}
                          description={t("leads360.empty.activity", {
                            defaultValue:
                              "Calls, emails, and WhatsApp touches will appear here as the team engages this lead.",
                          })}
                        />
                      ) : (
                        activities.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border/50 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[13px] font-medium">{item.subject}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {formatDateTime(item.occurredAt, i18n.language)}
                              </div>
                            </div>
                            <div className="mt-1 text-[12px] text-muted-foreground">
                              {item.channel}
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
                          title={t("leads360.empty.tasksTitle", {
                            defaultValue: "No tasks yet",
                          })}
                          description={t("leads360.empty.tasks", {
                            defaultValue:
                              "Create follow-ups from recommendations or assign the next sales step to keep this deal moving.",
                          })}
                        />
                      ) : (
                        tasks.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-lg border border-border/50 px-4 py-3"
                          >
                            <div className="text-[13px] font-medium">{task.title}</div>
                            <div className="mt-1 text-[12px] text-muted-foreground">
                              {task.status} · {task.assignee}
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
                          title={t("leads360.empty.filesTitle", {
                            defaultValue: "No files attached",
                          })}
                          description={t("leads360.empty.files", {
                            defaultValue:
                              "Upload proposals, contracts, or discovery notes so the team can find them in one place.",
                          })}
                        />
                      ) : (
                        files.map((file) => (
                          <div
                            key={file.id}
                            className="rounded-lg border border-border/50 px-4 py-3"
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
                        timeline={[]}
                        aiAudit={data?.aiAudit}
                        panel={null}
                      />
                    ) : null}
                  </TabsContent>
                </div>

                <div className="hidden shrink-0 border-s border-border/50 bg-muted/10 p-4 lg:block lg:w-[304px]">
                  <Lead360SmartRail lead={lead} panel={data?.aiPanel} />
                </div>
              </div>
            </Tabs>

            <div className="shrink-0 space-y-2 border-t border-border/60 px-6 py-3 sm:px-7">
              {(isSuperAdmin || hasPermission("opportunities.convert")) &&
              lead.isQualified &&
              !lead.customerId ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 w-full gap-2 rounded-md text-[13px] font-semibold"
                  disabled={opportunityCommands.createFromLead.isPending || !leadId}
                  onClick={() => {
                    if (!leadId) return;
                    opportunityCommands.createFromLead.mutate(
                      { leadId },
                      {
                        onSuccess: (opp) => {
                          toast({
                            title: t("opportunities.created", {
                              defaultValue: "Opportunity created",
                            }),
                          });
                          setCreatedOpportunityId(opp.id);
                        },
                        onError: (err) => {
                          toast({
                            title: t("opportunities.createFailed", {
                              defaultValue: "Could not create opportunity",
                            }),
                            description: err instanceof Error ? err.message : String(err),
                            variant: "destructive",
                          });
                        },
                      },
                    );
                  }}
                >
                  {opportunityCommands.createFromLead.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BriefcaseBusiness className="size-4" />
                  )}
                  {t("leads360.createOpportunity", { defaultValue: "Create Opportunity" })}
                </Button>
              ) : null}
              {!lead.customerId ? (
                <Button
                  type="button"
                  className="h-11 w-full gap-2 rounded-md text-[13px] font-semibold"
                  disabled={commands.convert.isPending || !leadId}
                  onClick={() => {
                    if (!leadId) return;
                    void commands.convert
                      .mutateAsync({ leadId })
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
            <Opportunity360Workspace
              opportunityId={createdOpportunityId}
              open={Boolean(createdOpportunityId)}
              onOpenChange={(next) => {
                if (!next) setCreatedOpportunityId(null);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
