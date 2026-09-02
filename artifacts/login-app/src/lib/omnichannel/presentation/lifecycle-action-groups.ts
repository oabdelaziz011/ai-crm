import type { LifecycleAction, LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";

/** Presentation-only grouping of lifecycle actions for the action bar. */
export type LifecycleActionUiId =
  | "reply"
  | "internal_note"
  | "take_over"
  | "assign"
  | "transfer"
  | "escalate"
  | "return_to_ai"
  | "pause_ai"
  | "resume_ai"
  | "resolve"
  | "close"
  | "reopen"
  | "return_escalation"
  | "cancel_escalation"
  | "open_ai"
  | "open_assignment"
  | "link_customer";

export type LifecycleActionGroup = {
  primary: LifecycleActionUiId[];
  overflow: LifecycleActionUiId[];
};

const AI_OWNED_STATES: LifecycleState[] = ["NEW", "AI_HANDLING"];
const TERMINAL_STATES: LifecycleState[] = ["RESOLVED", "CLOSED"];

function mapUiToLifecycle(action: LifecycleActionUiId): LifecycleAction | null {
  switch (action) {
    case "reply":
    case "internal_note":
      return "reply";
    case "take_over":
      return "take_over";
    case "assign":
      return "assign";
    case "transfer":
      return "transfer";
    case "escalate":
      return "escalate";
    case "return_to_ai":
      return "return_to_ai";
    case "pause_ai":
      return "return_to_ai";
    case "resume_ai":
      return "ai_resume";
    case "resolve":
      return "resolve";
    case "close":
      return "close";
    case "reopen":
      return "reopen";
    case "return_escalation":
      return "return";
    case "cancel_escalation":
      return "escalation_cancel";
    default:
      return null;
  }
}

function allowed(
  uiId: LifecycleActionUiId,
  canPerform: (action: LifecycleAction) => boolean,
): boolean {
  const lifecycleAction = mapUiToLifecycle(uiId);
  if (!lifecycleAction) return true;
  return canPerform(lifecycleAction);
}

export function isToolbarActionVisible(input: {
  actionId: LifecycleActionUiId;
  lifecycleState: LifecycleState;
  escalated: boolean;
  isClosed: boolean;
  canPerform: (action: LifecycleAction) => boolean;
  showLinkCustomer?: boolean;
  aiPaused?: boolean;
}): boolean {
  const { actionId, lifecycleState, escalated, isClosed, canPerform, showLinkCustomer, aiPaused } = input;
  const terminal = isClosed || TERMINAL_STATES.includes(lifecycleState);
  const aiOwned = AI_OWNED_STATES.includes(lifecycleState);

  switch (actionId) {
    case "link_customer":
      return Boolean(showLinkCustomer);
    case "take_over":
      return allowed(actionId, canPerform) && aiOwned && !terminal;
    case "return_to_ai":
      return allowed(actionId, canPerform) && !aiOwned && !terminal;
    case "pause_ai":
      return allowed(actionId, canPerform) && !aiOwned && !terminal && !aiPaused;
    case "resume_ai":
      return allowed(actionId, canPerform) && !terminal && Boolean(aiPaused);
    case "reply":
    case "internal_note":
      return allowed(actionId, canPerform) && !terminal;
    case "resolve":
      return allowed(actionId, canPerform) && !terminal;
    case "reopen":
      return allowed(actionId, canPerform) && terminal;
    case "close":
      return allowed(actionId, canPerform) && !terminal;
    case "open_ai":
      return true;
    case "assign":
    case "transfer":
    case "open_assignment":
      return allowed(actionId === "assign" ? "assign" : actionId === "transfer" ? "transfer" : "assign", canPerform) && !terminal;
    case "escalate":
      return allowed(actionId, canPerform) && !terminal;
    case "return_escalation":
    case "cancel_escalation":
      return allowed(actionId, canPerform) && (escalated || lifecycleState === "ESCALATED");
    default:
      return allowed(actionId, canPerform);
  }
}

export function resolveLifecycleActionGroups(input: {
  lifecycleState: LifecycleState;
  escalated: boolean;
  isClosed: boolean;
  canPerform: (action: LifecycleAction) => boolean;
  showLinkCustomer?: boolean;
  aiPaused?: boolean;
}): LifecycleActionGroup {
  const visible = (id: LifecycleActionUiId) =>
    isToolbarActionVisible({ ...input, actionId: id });

  const primary: LifecycleActionUiId[] = [];
  const overflow: LifecycleActionUiId[] = [];

  const toolbarOrder: LifecycleActionUiId[] = [
    "reply",
    "internal_note",
    "open_ai",
    "assign",
    "take_over",
    "return_to_ai",
    "pause_ai",
    "resume_ai",
    "escalate",
    "resolve",
    "close",
    "reopen",
    "transfer",
    "link_customer",
  ];

  for (const id of toolbarOrder) {
    if (visible(id)) primary.push(id);
  }

  if (visible("return_escalation")) primary.push("return_escalation");
  if (visible("cancel_escalation")) primary.push("cancel_escalation");

  if (visible("open_assignment") && !primary.includes("assign") && !primary.includes("transfer")) {
    overflow.push("open_assignment");
  }

  return { primary, overflow };
}
