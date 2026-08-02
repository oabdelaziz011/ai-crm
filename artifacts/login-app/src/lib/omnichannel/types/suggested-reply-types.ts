import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";

export type SuggestedReplyIntentKey =
  | "greeting"
  | "billing"
  | "scheduling"
  | "support_escalation"
  | "sales"
  | "general";

export type SuggestedReplySignal =
  | "last_messages"
  | "conversation_summary"
  | "customer_mood"
  | "intent_classification"
  | "journey_stage"
  | "customer_360"
  | "crm_attributes"
  | "knowledge_retrieval";

export type SuggestedReplyExplanation = {
  reason: string;
  signalsUsed: SuggestedReplySignal[];
  intent: string;
  mood: CustomerTone;
  journey: string;
  knowledgeSource: string | null;
  confidence: number;
};

export type IntelligentSuggestedReply = {
  id: string;
  text: string;
  confidence: number;
  intent: SuggestedReplyIntentKey;
  explanation: SuggestedReplyExplanation;
};

export type SuggestedReplyCatalogBucket =
  | "empty"
  | "billingNeutral"
  | "billingUrgent"
  | "scheduling"
  | "refundNeutral"
  | "refundAngry"
  | "salesNeutral"
  | "confused"
  | "happy"
  | "general";
