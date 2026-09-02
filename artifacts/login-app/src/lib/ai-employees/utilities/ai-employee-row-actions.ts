import type { AiEmployeeLifecycleStatus, AiEmployeeRecord } from "@/lib/ai-employees/types";

/**
 * Control Center list/detail action ids.
 * Visibility is driven by lifecycle status + existing agents.* permissions only.
 */
export type AiEmployeeRowActionId =
  | "view"
  | "edit"
  | "continue"
  | "manageChannels"
  | "manageCapabilities"
  | "publish"
  | "disable"
  | "restore"
  | "delete";

export type AiEmployeeRowActionCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
};

export type AiEmployeeRowAction = {
  id: AiEmployeeRowActionId;
  /** Destructive styling hint for Delete. */
  destructive?: boolean;
};

const ACTION_ORDER: AiEmployeeRowActionId[] = [
  "view",
  "continue",
  "edit",
  "manageChannels",
  "manageCapabilities",
  "publish",
  "disable",
  "restore",
  "delete",
];

/**
 * Deterministic action menu for the AI Employee Control Center list.
 * Does not invent lifecycle states — uses draft | published | disabled | archived.
 */
export function visibleAiEmployeeRowActions(
  employee: Pick<AiEmployeeRecord, "status">,
  caps: AiEmployeeRowActionCapabilities,
): AiEmployeeRowAction[] {
  const status = employee.status as AiEmployeeLifecycleStatus;
  const visible = new Set<AiEmployeeRowActionId>();

  if (caps.canView) visible.add("view");

  if (status === "draft") {
    if (caps.canEdit) {
      visible.add("continue");
      visible.add("edit");
    }
    if (caps.canPublish) visible.add("publish");
    if (caps.canDelete) visible.add("delete");
  } else if (status === "published") {
    if (caps.canEdit) {
      visible.add("edit");
      visible.add("manageChannels");
      visible.add("manageCapabilities");
      visible.add("disable");
    }
    if (caps.canDelete) visible.add("delete");
  } else if (status === "disabled") {
    if (caps.canEdit) {
      visible.add("edit");
      visible.add("manageChannels");
      visible.add("manageCapabilities");
    }
    if (caps.canPublish) visible.add("publish");
    if (caps.canDelete) visible.add("delete");
  } else if (status === "archived") {
    // Archived = already soft-deleted lifecycle; Restore only — never Delete or Continue Setup.
    if (caps.canPublish || caps.canEdit) visible.add("restore");
    if (caps.canView) visible.add("view");
  }

  return ACTION_ORDER.filter((id) => visible.has(id)).map((id) => ({
    id,
    destructive: id === "delete",
  }));
}

/** True when the Control Center detail should block all mutations. */
export function isAiEmployeeReadOnlyViewMode(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("mode") === "view";
}

/** Delete is only offered for draft, disabled, and published (blocked server-side when published). */
export function isAiEmployeeDeleteEligible(status: AiEmployeeLifecycleStatus): boolean {
  return status === "draft" || status === "disabled" || status === "published";
}
