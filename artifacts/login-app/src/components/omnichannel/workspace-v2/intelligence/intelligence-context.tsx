import { createContext, memo, useContext, useMemo, type ReactNode } from "react";

import type { ConversationIntelligenceSnapshot } from "@/lib/omnichannel/presentation/conversation-intelligence-types";

import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";

import {

  buildIntelligenceViewModel,

  type IntelligenceViewModel,

} from "@/lib/omnichannel/presentation/intelligence-view-model";

import { buildIntelligenceV2ViewModel } from "@/lib/omnichannel/presentation/intelligence-v2-view-model";

import type {

  ConversationIntelligenceSidebarLabels,

  IntelligenceSidebarTab,

} from "@/components/omnichannel/workspace-v2/conversation-intelligence-sidebar";

import type {

  OmnichannelAiAssistModel,

  OmnichannelCustomerContext,

  UnifiedConversation,

  UnifiedMessage,

} from "@/lib/omnichannel/types/unified-conversation";

import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";



export type IntelligenceContextValue = {

  snapshot: ConversationIntelligenceSnapshot;

  viewModel: IntelligenceViewModel & { v2: NonNullable<IntelligenceViewModel["v2"]> };

  conversation: UnifiedConversation | null;

  customerContext?: OmnichannelCustomerContext | null;

  labels: ConversationIntelligenceSidebarLabels;

  panelLabels: ConversationIntelligenceSidebarLabels["panel"];

  polishLabels: ConversationIntelligenceSidebarLabels["polish"];

  smartTimeLabels: SmartTimeLabels;

  notAvailable: string;

  dir: "ltr" | "rtl";

  onNavigateToAssignee?: (userId: string) => void;

  onNavigateToAiEmployee?: (aiEmployeeId: string) => void;

  onOpenCrmTab?: () => void;

  onLinkCustomer?: () => void;

  onCreateCustomer?: () => void;

};



const IntelligenceContext = createContext<IntelligenceContextValue | null>(null);



export function useIntelligenceContext(): IntelligenceContextValue {

  const value = useContext(IntelligenceContext);

  if (!value) throw new Error("useIntelligenceContext must be used within IntelligenceProvider");

  return value;

}



type IntelligenceProviderProps = {

  snapshot: ConversationIntelligenceSnapshot;

  messages: UnifiedMessage[];

  conversation: UnifiedConversation | null;

  aiAssist: OmnichannelAiAssistModel;

  lifecycleSnapshot?: LifecycleSnapshot | null;

  customerContext?: OmnichannelCustomerContext | null;

  labels: ConversationIntelligenceSidebarLabels;

  smartTimeLabels: SmartTimeLabels;

  notSetLabel?: string;

  onNavigateToAssignee?: (userId: string) => void;

  onNavigateToAiEmployee?: (aiEmployeeId: string) => void;

  onOpenCrmTab?: () => void;

  onLinkCustomer?: () => void;

  onCreateCustomer?: () => void;

  children: ReactNode;

};



export const IntelligenceProvider = memo(function IntelligenceProvider({

  snapshot,

  messages,

  conversation,

  aiAssist,

  lifecycleSnapshot,

  customerContext,

  labels,

  smartTimeLabels,

  notSetLabel = "—",

  onNavigateToAssignee,

  onNavigateToAiEmployee,

  onOpenCrmTab,

  onLinkCustomer,

  onCreateCustomer,

  children,

}: IntelligenceProviderProps) {

  const viewModel = useMemo(() => {

    const base = buildIntelligenceViewModel(snapshot, messages, customerContext, lifecycleSnapshot, {

      ...labels.polish,

      healthSla: labels.panel.healthSla,

      healthAvgResponse: labels.panel.healthAvgResponse,

      healthCustomerMessages: labels.panel.healthCustomerMessages,

      healthAgentMessages: labels.panel.healthAgentMessages,

      healthInternalNotes: labels.panel.healthInternalNotes,

      healthEscalations: labels.panel.healthEscalations,

      minutesShort: labels.panel.minutesShort,

    });

    const v2 = buildIntelligenceV2ViewModel({

      snapshot,

      messages,

      conversation,

      customerContext,

      lifecycleSnapshot,

      aiAssist,

      trend: base.moodTrend,

      labels: labels.v2,

      minutesShort: labels.panel.minutesShort,

      notSet: notSetLabel,

    });

    return { ...base, v2 } as IntelligenceViewModel & { v2: typeof v2 };

  }, [

    snapshot,

    messages,

    conversation,

    customerContext,

    lifecycleSnapshot,

    aiAssist,

    labels,

    notSetLabel,

  ]);



  const value = useMemo(

    (): IntelligenceContextValue => ({

      snapshot,

      viewModel,

      conversation,

      customerContext,

      labels,

      panelLabels: labels.panel,

      polishLabels: labels.polish,

      smartTimeLabels,

      notAvailable: notSetLabel,

      dir: snapshot.insight.direction,

      onNavigateToAssignee,

      onNavigateToAiEmployee,

      onOpenCrmTab,

      onLinkCustomer,

      onCreateCustomer,

    }),

    [

      snapshot,

      viewModel,

      conversation,

      customerContext,

      labels,

      smartTimeLabels,

      notSetLabel,

      onNavigateToAssignee,

      onNavigateToAiEmployee,

      onOpenCrmTab,

      onLinkCustomer,

      onCreateCustomer,

    ],

  );



  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;

});



export type { IntelligenceSidebarTab };

