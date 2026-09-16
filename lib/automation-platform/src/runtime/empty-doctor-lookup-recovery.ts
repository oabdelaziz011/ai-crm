import type { ConversationLanguage } from "./conversation-language.js";
import { canonicalizeSelectionId } from "./bilingual-selection-aliases.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import type { OutboundQueueEntry } from "./outbound-queue.js";

export const EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE = "__emptyDoctorLookupRecovery";
export const ANOTHER_DOCTOR_SELECTION_ID = "another_doctor";
export const END_CHAT_SELECTION_ID = "end_chat";

export function isDoctorCatalogLookup(lookup: string): boolean {
  return lookup === "resources" || lookup === "staff";
}

export function emptyDoctorCatalogMessage(language: ConversationLanguage | null | undefined): string {
  return language === "en"
    ? "No options are available right now."
    : "لا توجد خيارات متاحة حالياً.";
}

export function emptyDoctorCatalogRecoveryPrompt(language: ConversationLanguage | null | undefined): string {
  return language === "en"
    ? "Would you like to book with another doctor, or end the conversation?"
    : "تحب نحجز مع دكتور تاني، ولا ننهي المحادثة؟";
}

export function emptyDoctorCatalogRecoveryButtons(language: ConversationLanguage | null | undefined): Array<{
  id: string;
  label: string;
}> {
  if (language === "en") {
    return [
      { id: ANOTHER_DOCTOR_SELECTION_ID, label: "Another doctor" },
      { id: END_CHAT_SELECTION_ID, label: "End chat" },
    ];
  }
  return [
    { id: ANOTHER_DOCTOR_SELECTION_ID, label: "نحجز مع دكتور تاني" },
    { id: END_CHAT_SELECTION_ID, label: "ننهي المحادثة" },
  ];
}

export function emptyDoctorCatalogRecoveryOutbound(
  language: ConversationLanguage | null | undefined,
): OutboundQueueEntry {
  return {
    kind: "buttons",
    text: emptyDoctorCatalogRecoveryPrompt(language),
    buttons: emptyDoctorCatalogRecoveryButtons(language),
  };
}

export function emptyDoctorCatalogGoodbye(language: ConversationLanguage | null | undefined): string {
  return language === "en"
    ? "Thanks — message us anytime if you need anything else."
    : "شكراً لحضرتك، لو احتجت حاجة تانية كلمني في أي وقت.";
}

export function resolveEmptyDoctorLookupRecoveryId(input: {
  replyId?: string | null;
  title?: string | null;
  lastMessage?: string | null;
}): typeof ANOTHER_DOCTOR_SELECTION_ID | typeof END_CHAT_SELECTION_ID | null {
  const values = [input.replyId, input.title, input.lastMessage];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    if (trimmed === ANOTHER_DOCTOR_SELECTION_ID || trimmed === END_CHAT_SELECTION_ID) {
      return trimmed;
    }
    const canonical = canonicalizeSelectionId(trimmed, trimmed);
    if (canonical === ANOTHER_DOCTOR_SELECTION_ID || canonical === END_CHAT_SELECTION_ID) {
      return canonical;
    }
  }
  return null;
}

export function findPrecedingServicesListNode(
  currentNodeId: string,
  nodes: AutomationNodeRecord[],
  edges: AutomationEdgeRecord[],
): AutomationNodeRecord | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>([currentNodeId]);
  const queue = [currentNodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of edges) {
      if (edge.target_node_id !== id) continue;
      if (seen.has(edge.source_node_id)) continue;
      seen.add(edge.source_node_id);
      const source = byId.get(edge.source_node_id);
      if (!source) continue;
      if (source.config.action === "send_list" && source.config.lookup === "services") {
        return source;
      }
      queue.push(source.id);
    }
  }

  return null;
}

export function emptyDoctorLookupRetryPatch(): Record<string, unknown> {
  return {
    selected_service: null,
    selected_resource: null,
    selected_staff: null,
    selected_date: null,
    selected_slot: null,
    interactive_selection: null,
    [EMPTY_DOCTOR_LOOKUP_RECOVERY_VARIABLE]: null,
  };
}
