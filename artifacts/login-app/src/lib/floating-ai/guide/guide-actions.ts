/**
 * Client-side Guide action protocol (no tools).
 * Assistant may emit a fenced JSON action; the panel validates + navigates.
 */
import type { GuideTaskId } from "./permission-matrix";

export const GUIDE_ACTION_FENCE_START = ":::valueor-guide";
export const GUIDE_ACTION_FENCE_END = ":::";

export type GuideClientAction =
  | { type: "navigate"; routeId: string }
  | { type: "navigateTask"; taskId: GuideTaskId }
  | { type: "workflow"; workflowId: string; stepIndex?: number };

const FENCE_RE =
  /:::valueor-guide\s*([\s\S]*?)\s*:::/gi;

export function stripGuideActionsFromMessage(content: string): {
  displayText: string;
  actions: GuideClientAction[];
} {
  const actions: GuideClientAction[] = [];
  const displayText = content
    .replace(FENCE_RE, (_full, body: string) => {
      const parsed = parseGuideActionJson(String(body).trim());
      if (parsed) actions.push(parsed);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { displayText, actions };
}

export function parseGuideActionJson(raw: string): GuideClientAction | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.type === "navigate" && typeof data.routeId === "string" && data.routeId.trim()) {
      return { type: "navigate", routeId: data.routeId.trim() };
    }
    if (data.type === "navigateTask" && typeof data.taskId === "string" && data.taskId.trim()) {
      return { type: "navigateTask", taskId: data.taskId.trim() as GuideTaskId };
    }
    if (data.type === "workflow" && typeof data.workflowId === "string" && data.workflowId.trim()) {
      return {
        type: "workflow",
        workflowId: data.workflowId.trim(),
        stepIndex: typeof data.stepIndex === "number" ? data.stepIndex : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function formatGuideNavigateAction(routeId: string): string {
  return `${GUIDE_ACTION_FENCE_START}\n${JSON.stringify({ type: "navigate", routeId })}\n${GUIDE_ACTION_FENCE_END}`;
}
