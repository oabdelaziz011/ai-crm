import type { ConversationState } from "@workspace/ai-conversation";
import type {
  LifecycleContext,
  LifecycleMetadataOverlay,
  LifecycleState,
} from "../types/lifecycle-types.js";

const LIFECYCLE_METADATA_KEY = "lifecycle";

export function readLifecycleOverlay(
  metadata: Record<string, unknown> | null | undefined,
): LifecycleMetadataOverlay | null {
  if (!metadata) return null;
  const raw = metadata[LIFECYCLE_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  return raw as LifecycleMetadataOverlay;
}

export function writeLifecycleOverlay(
  metadata: Record<string, unknown>,
  overlay: LifecycleMetadataOverlay,
): Record<string, unknown> {
  return { ...metadata, [LIFECYCLE_METADATA_KEY]: overlay };
}

/**
 * Maps backend conversation record signals to enterprise lifecycle state.
 * Metadata overlay takes precedence when present (backward compatible extension).
 */
export function resolveLifecycleState(context: LifecycleContext): LifecycleState {
  const overlay = readLifecycleOverlay(context.metadata);

  if (overlay?.state) {
    if (overlay.state === "REOPENED" && context.backendState === "closed") {
      return "REOPENED";
    }
    if (overlay.state !== "REOPENED" || context.backendState !== "closed") {
      return overlay.state;
    }
  }

  if (context.hasActiveEscalation) return "ESCALATED";
  if (overlay?.pendingInternal) return "PENDING_INTERNAL";

  const backend = context.backendState as ConversationState;

  if (backend === "closed") return overlay?.reopenedAt ? "REOPENED" : "CLOSED";
  if (backend === "completed") return "RESOLVED";
  if (backend === "cancelled") return "CLOSED";

  if (backend === "idle") return "NEW";

  if (backend === "transferred_to_human") {
    if (context.assignedUserId || context.operationalAssignment?.targetType === "user") {
      return "ASSIGNED";
    }
    return "WAITING_QUEUE";
  }

  if (context.assignedUserId || context.operationalAssignment) {
    if (backend === "waiting_user" && context.lastParticipantType === "employee") {
      return "PENDING_CUSTOMER";
    }
    return "ASSIGNED";
  }

  if (backend === "waiting_user") {
    if (context.lastParticipantType === "employee") return "PENDING_CUSTOMER";
    return "AI_HANDLING";
  }

  if (
    backend === "greeting" ||
    backend === "collecting_information" ||
    backend === "waiting_api"
  ) {
    return "AI_HANDLING";
  }

  return "AI_HANDLING";
}

/** Hints for invoking existing backend APIs without modifying runtime. */
export type BackendActionHint =
  | { kind: "assign"; assignedUserId: string }
  | { kind: "release" }
  | { kind: "close" }
  | { kind: "update_metadata"; metadata: Record<string, unknown> }
  | { kind: "add_message"; messageType: "outgoing" | "internal_note" }
  | { kind: "none" };

export function mapLifecycleActionToBackendHint(
  action: string,
  context: LifecycleContext,
): BackendActionHint {
  switch (action) {
    case "take_over":
    case "assign":
    case "reassign":
    case "accept":
    case "transfer":
      if (context.operationalAssignment?.targetType === "user") {
        return { kind: "assign", assignedUserId: context.operationalAssignment.targetId };
      }
      if (context.assignedUserId) {
        return { kind: "assign", assignedUserId: context.assignedUserId };
      }
      return { kind: "none" };
    case "return_to_ai":
    case "ai_release":
      return { kind: "release" };
    case "close":
    case "resolve":
      return { kind: "close" };
    case "reply":
      return { kind: "add_message", messageType: "outgoing" };
    case "internal_note":
      return { kind: "add_message", messageType: "internal_note" };
    case "reopen":
      return {
        kind: "update_metadata",
        metadata: writeLifecycleOverlay(context.metadata, {
          ...readLifecycleOverlay(context.metadata),
          state: "REOPENED",
          reopenedAt: new Date().toISOString(),
        }),
      };
    default:
      return {
        kind: "update_metadata",
        metadata: context.metadata,
      };
  }
}

export function mapBackendStateToLifecycleLabel(state: ConversationState): LifecycleState {
  const ctx: LifecycleContext = {
    conversationId: "",
    backendState: state,
    assignedUserId: null,
    aiAssistantId: "",
    metadata: {},
  };
  return resolveLifecycleState(ctx);
}
