export type OpportunityTableActionId = "openOpportunity360" | "archive";

export type OpportunityTableActionPermissions = {
  canView: boolean;
  canEdit: boolean;
  canArchive: boolean;
};

export type OpportunityTableActionDef = {
  id: OpportunityTableActionId;
  labelKey: string;
  destructive?: boolean;
};

/**
 * Row menu actions. Status is read from the lead Kanban and is not edited here.
 */
export function resolveOpportunityTableActions(
  permissions: OpportunityTableActionPermissions,
): OpportunityTableActionDef[] {
  const actions: OpportunityTableActionDef[] = [];
  if (permissions.canView) {
    actions.push({
      id: "openOpportunity360",
      labelKey: "opportunities.table.rowActions.open",
    });
  }
  if (permissions.canArchive) {
    actions.push({
      id: "archive",
      labelKey: "opportunities.table.rowActions.archive",
      destructive: true,
    });
  }
  return actions;
}

export function isLostStageKey(stageKey: string | null | undefined): boolean {
  return String(stageKey ?? "")
    .trim()
    .toLowerCase() === "lost";
}

/** Client-side guard mirroring server: lost transitions require a non-empty reason. */
export function validateLostReason(reason: string | null | undefined): string | null {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (!trimmed) return "opportunities.table.errors.lostReasonRequired";
  return null;
}
