import type { ActionGroupId } from "./types";

export const ACTION_GROUP_ORDER: ActionGroupId[] = [
  "general",
  "workflow",
  "billing",
  "communication",
  "assignment",
  "ai",
  "history",
  "danger",
];

export const ACTION_GROUP_LABEL_KEYS: Record<ActionGroupId, string> = {
  general: "universalOperations.actions.groups.general",
  workflow: "universalOperations.actions.groups.workflow",
  billing: "universalOperations.actions.groups.billing",
  communication: "universalOperations.actions.groups.communication",
  assignment: "universalOperations.actions.groups.assignment",
  ai: "universalOperations.actions.groups.ai",
  history: "universalOperations.actions.groups.history",
  danger: "universalOperations.actions.groups.danger",
};
