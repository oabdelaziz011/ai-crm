import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Brain, GripVertical, PanelRightClose } from "lucide-react";

import type {

  OmnichannelAiAssistModel,

  OmnichannelCustomerContext,

  UnifiedConversation,

  UnifiedMessage,

} from "@/lib/omnichannel/types/unified-conversation";

import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";

import type { Profile } from "@/lib/types";

import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";

import type { IntelligencePolishLabels } from "@/lib/omnichannel/presentation/intelligence-view-model";

import type { IntelligenceV2Labels } from "@/lib/omnichannel/presentation/intelligence-v2-view-model";

import { buildConversationIntelligenceSnapshot } from "@/lib/omnichannel/presentation/conversation-insight-provider";

import type { ConversationHistoryPanelLabels } from "@/components/omnichannel/workspace-v2/conversation-history-panel";

import { IntelligenceProvider } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";

import { IntelligenceSummaryTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-summary-tab";

import { IntelligenceHistoryTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-history-tab";

import { IntelligenceMoodTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-mood-tab";

import { IntelligenceRecommendationTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-recommendation-tab";

import { IntelligenceHealthTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-health-tab";

import { IntelligenceJourneyTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-journey-tab";

import { IntelligenceCrmTab } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-crm-tab";

import { useIntelligencePanelWidth } from "@/components/omnichannel/workspace-v2/intelligence/use-intelligence-panel-width";



export type IntelligenceSidebarTab =

  | "summary"

  | "mood"

  | "recommendation"

  | "health"

  | "journey"

  | "history"

  | "crm";



export type IntelligenceCrmLabels = {

  title: string;

  notLinkedTitle: string;

  notLinkedHint: string;

  linkCustomer: string;

  createCustomer: string;

  customerName: string;

  company: string;

  phone: string;

  email: string;

  status: string;

  vip: string;

  createdDate: string;

  lastActivity: string;

  openTickets: string;

  totalOrders: string;

  totalRevenue: string;

  yes: string;

  no: string;

};



export type ConversationIntelligenceSidebarLabels = {

  title: string;

  collapseLabel: string;

  expandLabel: string;

  emptyConversation: string;

  tabs: Record<IntelligenceSidebarTab, string>;

  panel: ConversationHistoryPanelLabels;

  polish: IntelligencePolishLabels;

  v2: IntelligenceV2Labels;

  crm: IntelligenceCrmLabels;

};



type ConversationIntelligenceSidebarProps = {

  open: boolean;

  onToggle: () => void;

  conversation: UnifiedConversation | null;

  messages: UnifiedMessage[];

  lifecycleSnapshot?: LifecycleSnapshot | null;

  customerContext?: OmnichannelCustomerContext | null;

  aiAssist: OmnichannelAiAssistModel;

  agentsById?: ReadonlyMap<string, { id: string; name: string }>;

  profilesByUserId?: ReadonlyMap<string, Profile>;

  smartTimeLabels: SmartTimeLabels;

  labels: ConversationIntelligenceSidebarLabels;

  supportAgentFallback?: string;

  slaLabels?: {

    remainingMinutes: (count: number) => string;

    remainingHours: (count: number) => string;

    breached: string;

    notSet: string;

  };

  focusTab?: IntelligenceSidebarTab | null;

  onFocusTabHandled?: () => void;

  onNavigateToAssignee?: (userId: string) => void;

  onNavigateToAiEmployee?: (aiEmployeeId: string) => void;

  onLinkCustomer?: () => void;

  onCreateCustomer?: () => void;

};



const TAB_ORDER: IntelligenceSidebarTab[] = [

  "summary",

  "mood",

  "recommendation",

  "health",

  "journey",

  "history",

  "crm",

];



export const ConversationIntelligenceSidebar = memo(function ConversationIntelligenceSidebar({

  open,

  onToggle,

  conversation,

  messages,

  lifecycleSnapshot,

  customerContext,

  aiAssist,

  agentsById,

  profilesByUserId,

  smartTimeLabels,

  labels,

  supportAgentFallback,

  slaLabels,

  focusTab,

  onFocusTabHandled,

  onNavigateToAssignee,

  onNavigateToAiEmployee,

  onLinkCustomer,

  onCreateCustomer,

}: ConversationIntelligenceSidebarProps) {

  const [activeTab, setActiveTab] = useState<IntelligenceSidebarTab>("summary");

  const panelRef = useRef<HTMLElement>(null);

  const { width, isResizing, startResize } = useIntelligencePanelWidth();



  useEffect(() => {

    if (!focusTab) return;

    setActiveTab(focusTab);

    onFocusTabHandled?.();

  }, [focusTab, onFocusTabHandled]);



  const snapshot = useMemo(

    () =>

      buildConversationIntelligenceSnapshot({

        conversation,

        messages,

        lifecycleSnapshot,

        customerContext,

        aiAssist,

        agentsById,

        profilesByUserId,

        labels: labels.panel,

        smartTimeLabels,

        supportAgentFallback,

        slaLabels,

      }),

    [

      agentsById,

      aiAssist,

      conversation,

      customerContext,

      labels.panel,

      lifecycleSnapshot,

      messages,

      profilesByUserId,

      slaLabels,

      smartTimeLabels,

      supportAgentFallback,

    ],

  );



  const openCrmTab = useMemo(() => () => setActiveTab("crm"), []);



  const activePanel = useMemo(() => {

    switch (activeTab) {

      case "summary":

        return <IntelligenceSummaryTab />;

      case "history":

        return <IntelligenceHistoryTab />;

      case "mood":

        return <IntelligenceMoodTab />;

      case "recommendation":

        return <IntelligenceRecommendationTab />;

      case "health":

        return <IntelligenceHealthTab />;

      case "journey":

        return <IntelligenceJourneyTab />;

      case "crm":

        return <IntelligenceCrmTab />;

      default:

        return null;

    }

  }, [activeTab]);



  if (!open) {

    return (

      <aside className="ws-intelligence-rail hidden h-full min-h-0 w-10 shrink-0 flex-col items-center border-e border-[var(--ws-border)] bg-[var(--ws-surface)] py-2 xl:flex">

        <button

          type="button"

          className="ws-btn ws-btn--ghost p-2 text-[var(--ws-violet)]"

          onClick={onToggle}

          aria-label={labels.expandLabel}

        >

          <Brain className="size-4" />

        </button>

      </aside>

    );

  }



  return (

    <aside

      ref={panelRef}

      className={`ws-intelligence-panel relative hidden h-full min-h-0 shrink-0 flex-col border-e border-[var(--ws-border)] bg-[var(--ws-surface)] xl:flex ${

        isResizing ? "select-none" : ""

      }`}

      style={{ width }}

      aria-label={labels.title}

    >

      <button

        type="button"

        aria-label={labels.expandLabel}

        className="absolute end-0 top-0 z-10 flex h-full w-1 cursor-col-resize items-center justify-center border-none bg-transparent p-0 hover:bg-[var(--ws-accent)]/20"

        onPointerDown={(event) => {

          const rect = panelRef.current?.getBoundingClientRect();

          if (!rect) return;

          startResize(event.clientX, rect, "trailing");

        }}

      >

        <GripVertical className="pointer-events-none size-3 text-[var(--ws-muted)] opacity-0 transition-opacity hover:opacity-100" />

      </button>



      <header className="flex shrink-0 items-center justify-between border-b border-[var(--ws-border-subtle)] px-2.5 py-1.5 ps-4">

        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ws-violet)]">

          <Brain className="size-3.5" />

          {labels.title}

        </h2>

        <button type="button" className="ws-btn ws-btn--ghost p-1.5" onClick={onToggle} aria-label={labels.collapseLabel}>

          <PanelRightClose className="size-4" />

        </button>

      </header>



      <IntelligenceProvider

        snapshot={snapshot}

        messages={messages}

        conversation={conversation}

        aiAssist={aiAssist}

        lifecycleSnapshot={lifecycleSnapshot}

        customerContext={customerContext}

        labels={labels}

        smartTimeLabels={smartTimeLabels}

        notSetLabel={supportAgentFallback}

        onNavigateToAssignee={onNavigateToAssignee}

        onNavigateToAiEmployee={onNavigateToAiEmployee}

        onOpenCrmTab={openCrmTab}

        onLinkCustomer={onLinkCustomer}

        onCreateCustomer={onCreateCustomer}

      >

        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[var(--ws-border-subtle)] p-1.5 ps-3">

          {TAB_ORDER.map((tab) => (

            <button

              key={tab}

              type="button"

              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${

                activeTab === tab

                  ? "bg-primary/15 text-primary"

                  : "text-[var(--ws-muted)] hover:bg-[var(--ws-surface-2)]"

              }`}

              onClick={() => setActiveTab(tab)}

            >

              {labels.tabs[tab]}

            </button>

          ))}

        </div>



        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 ps-3 text-xs">

          {!conversation ? (

            <p className="px-2 py-6 text-center text-[10px] text-[var(--ws-muted)]">{labels.emptyConversation}</p>

          ) : (

            <div className="space-y-1.5">{activePanel}</div>

          )}

        </div>

      </IntelligenceProvider>

    </aside>

  );

});

