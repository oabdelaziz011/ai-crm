import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { OmnichannelPanel } from "@/components/omnichannel/omnichannel-panel";
import { CollapsibleSidebarSection } from "@/components/omnichannel/collapsible-sidebar-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type {
  OperationalAssignmentRecord,
  OperationalEscalationRecord,
} from "@/lib/conversation-lifecycle";
import type { Profile } from "@/lib/types";

const CustomerProfileDrawer = lazy(() =>
  import("@/components/customer-profile/customer-profile-drawer").then((module) => ({
    default: module.CustomerProfileDrawer,
  })),
);

export type WorkspaceSidebarLabels = {
  customer: string;
  aiSummary: string;
  crm: string;
  assignment: string;
  properties: string;
  timeline: string;
  internalNotes: string;
  recentActivity: string;
  empty: string;
  summary: string;
  intent: string;
  sentiment: string;
  priority: string;
  suggestedReply: string;
  confidence: string;
  assignTo: string;
  currentOwner: string;
  escalationHistory: string;
  returnConversation: string;
  crmTabs: {
    customer: string;
    orders: string;
    invoices: string;
    tickets: string;
    activities: string;
    timeline: string;
  };
  targetTypes: {
    user: string;
    team: string;
    department: string;
    ai_employee: string;
    queue: string;
  };
};

type WorkspaceSidebarProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  context: OmnichannelCustomerContext | null;
  aiAssist: OmnichannelAiAssistModel;
  profiles: Profile[];
  lifecycleSnapshot?: LifecycleSnapshot | null;
  operationalState: {
    assignment: OperationalAssignmentRecord | null;
    activeQueue: string | null;
    escalations: OperationalEscalationRecord[];
  };
  labels: WorkspaceSidebarLabels;
  onAssignTarget: (payload: {
    targetType: OperationalAssignmentRecord["targetType"];
    targetId: string;
    targetLabel: string;
  }) => void;
  onReturnEscalation: () => void;
  embedded?: boolean;
};

const DEFAULT_SECTION = "customer";

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  conversation,
  messages,
  context,
  aiAssist,
  profiles,
  lifecycleSnapshot,
  operationalState,
  labels,
  onAssignTarget,
  onReturnEscalation,
  embedded = false,
}: WorkspaceSidebarProps) {
  const { assignment, escalations } = operationalState;
  const [expandedSection, setExpandedSection] = useState<string>(DEFAULT_SECTION);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  const toggleSection = useCallback((id: string) => {
    setExpandedSection((current) => (current === id ? "" : id));
  }, []);

  const internalNotes = useMemo(
    () => messages.filter((message) => message.isInternalNote),
    [messages],
  );

  const timelineItems = useMemo(
    () =>
      lifecycleSnapshot?.timeline.map((event) => event.summary)
      ?? context?.timelinePreview
      ?? [],
    [lifecycleSnapshot?.timeline, context?.timelinePreview],
  );

  if (!conversation) {
    return (
      <OmnichannelPanel className="hidden h-full items-center justify-center p-6 xl:flex">
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      </OmnichannelPanel>
    );
  }

  const customer = conversation.customer;
  const ownerLabel =
    lifecycleSnapshot?.owner.label
    ?? assignment?.targetLabel
    ?? conversation.assignedAgent?.name
    ?? labels.currentOwner;

  return (
    <>
      <OmnichannelPanel className={embedded ? "flex h-full overflow-y-auto" : "hidden h-full overflow-y-auto xl:flex"} embedded={embedded}>
        <CollapsibleSidebarSection
          id="customer"
          title={labels.customer}
          expanded={expandedSection === "customer"}
          onToggle={toggleSection}
        >
          {customer ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{customer.name}</p>
              {customer.phone ? <p className="text-muted-foreground" dir="ltr">{customer.phone}</p> : null}
              {customer.email ? <p className="text-muted-foreground">{customer.email}</p> : null}
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setProfileDrawerOpen(true)}
              >
                {labels.crmTabs.customer}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.empty}</p>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="ai-summary"
          title={labels.aiSummary}
          expanded={expandedSection === "ai-summary"}
          onToggle={toggleSection}
        >
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">{labels.summary}</p>
              <p>{aiAssist.summary}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">{labels.intent}</p>
              <p>{aiAssist.intent}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">{labels.sentiment}</p>
                <p className="capitalize">{aiAssist.sentiment}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">{labels.priority}</p>
                <p className="capitalize">{aiAssist.priority}</p>
              </div>
            </div>
            {aiAssist.suggestedReplies[0] ? (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">{labels.suggestedReply}</p>
                <p className="text-muted-foreground">{aiAssist.suggestedReplies[0]}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">{labels.confidence}</p>
              <p>{Math.round((aiAssist.confidence ?? 0.5) * 100)}%</p>
            </div>
          </div>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="crm"
          title={labels.crm}
          expanded={expandedSection === "crm"}
          onToggle={toggleSection}
        >
          <Tabs defaultValue="customer" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger value="customer" className="text-[10px]">{labels.crmTabs.customer}</TabsTrigger>
              <TabsTrigger value="orders" className="text-[10px]">{labels.crmTabs.orders}</TabsTrigger>
              <TabsTrigger value="invoices" className="text-[10px]">{labels.crmTabs.invoices}</TabsTrigger>
            </TabsList>
            <TabsList className="mt-1 grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger value="tickets" className="text-[10px]">{labels.crmTabs.tickets}</TabsTrigger>
              <TabsTrigger value="activities" className="text-[10px]">{labels.crmTabs.activities}</TabsTrigger>
              <TabsTrigger value="timeline" className="text-[10px]">{labels.crmTabs.timeline}</TabsTrigger>
            </TabsList>
            <TabsContent value="customer" className="mt-2 text-sm">
              {customer ? (
                <div className="space-y-1">
                  <p>{customer.name}</p>
                  {customer.phone ? <p dir="ltr">{customer.phone}</p> : null}
                  {customer.email ? <p>{customer.email}</p> : null}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </TabsContent>
            <TabsContent value="orders" className="mt-2 text-sm text-muted-foreground">
              {context?.recentBookings ?? 0} {labels.crmTabs.orders.toLowerCase()}
            </TabsContent>
            <TabsContent value="invoices" className="mt-2 text-sm text-muted-foreground">
              {context?.outstandingInvoices ?? 0} {labels.crmTabs.invoices.toLowerCase()}
            </TabsContent>
            <TabsContent value="tickets" className="mt-2 text-sm text-muted-foreground">
              {context?.openTickets ?? 0} {labels.crmTabs.tickets.toLowerCase()}
            </TabsContent>
            <TabsContent value="activities" className="mt-2 text-sm text-muted-foreground">
              {(context?.recentAiActions ?? []).join(", ") || "—"}
            </TabsContent>
            <TabsContent value="timeline" className="mt-2 text-sm text-muted-foreground">
              {timelineItems.length > 0 ? timelineItems.join(" · ") : "—"}
            </TabsContent>
          </Tabs>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="assignment"
          title={labels.assignment}
          expanded={expandedSection === "assignment"}
          onToggle={toggleSection}
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{labels.currentOwner}: </span>
              {ownerLabel}
            </p>
            <label className="block text-[10px] uppercase text-muted-foreground">{labels.assignTo}</label>
            <select
              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                const [targetType, targetId] = value.split(":");
                const profile = profiles.find((item) => item.user_id === targetId);
                onAssignTarget({
                  targetType: targetType as OperationalAssignmentRecord["targetType"],
                  targetId,
                  targetLabel: profile?.full_name ?? targetId,
                });
                event.target.value = "";
              }}
            >
              <option value="">{labels.assignTo}</option>
              <optgroup label={labels.targetTypes.user}>
                {profiles.map((profile) => (
                  <option key={profile.user_id} value={`user:${profile.user_id}`}>
                    {profile.full_name ?? profile.email ?? profile.user_id}
                  </option>
                ))}
              </optgroup>
              <option value="team:support">{labels.targetTypes.team}: Support</option>
              <option value="department:billing">{labels.targetTypes.department}: Billing</option>
              <option value="ai_employee:default">{labels.targetTypes.ai_employee}: Default</option>
              <option value="queue:unassigned">{labels.targetTypes.queue}: Unassigned</option>
            </select>
          </div>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="properties"
          title={labels.properties}
          expanded={expandedSection === "properties"}
          onToggle={toggleSection}
        >
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">
                {(lifecycleSnapshot?.state ?? conversation.lifecycleState).replace(/_/g, " ").toLowerCase()}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Priority</dt>
              <dd className="capitalize">{conversation.priority}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Channel</dt>
              <dd>{conversation.channelLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Language</dt>
              <dd>{aiAssist.languageLabel}</dd>
            </div>
          </dl>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="timeline"
          title={labels.timeline}
          expanded={expandedSection === "timeline"}
          onToggle={toggleSection}
        >
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {timelineItems.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              timelineItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
            )}
          </ul>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="internal-notes"
          title={labels.internalNotes}
          expanded={expandedSection === "internal-notes"}
          onToggle={toggleSection}
        >
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
            {internalNotes.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              internalNotes.map((note) => (
                <li key={note.id} className="rounded-md border border-amber-400/20 bg-amber-400/5 p-2">
                  <p className="font-medium">{note.senderLabel}</p>
                  <p className="text-muted-foreground">{note.body}</p>
                </li>
              ))
            )}
          </ul>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          id="recent-activity"
          title={labels.recentActivity}
          expanded={expandedSection === "recent-activity"}
          onToggle={toggleSection}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(context?.recentAiActions ?? []).length === 0
              ? "—"
              : (context?.recentAiActions ?? []).map((item) => <li key={item}>{item}</li>)}
          </ul>
          {escalations.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] uppercase text-muted-foreground">{labels.escalationHistory}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {escalations.map((record) => (
                  <li key={record.id}>
                    {record.level} · {record.reason} · {new Date(record.escalatedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-xs text-primary hover:underline"
                onClick={onReturnEscalation}
              >
                {labels.returnConversation}
              </button>
            </div>
          ) : null}
        </CollapsibleSidebarSection>
      </OmnichannelPanel>

      {customer ? (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            open={profileDrawerOpen}
            onClose={() => setProfileDrawerOpen(false)}
            customerId={customer.id}
          />
        </Suspense>
      ) : null}
    </>
  );
});
