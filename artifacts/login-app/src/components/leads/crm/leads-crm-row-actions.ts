/**
 * Pure helpers for Lead CRM table row actions (RBAC + contact availability).
 * Kept free of React so unit tests can run without DOM/path aliases.
 */

export type LeadTableActionId =
  | "openLead360"
  | "edit"
  | "createActivity"
  | "completeDemo"
  | "createOpportunity"
  | "createQuote"
  | "call"
  | "whatsapp"
  | "email"
  | "assign"
  | "convertWithOpportunity"
  | "convert"
  | "archive"
  | "delete";

export type LeadTableActionGroupId =
  | "navigation"
  | "editing"
  | "communication"
  | "assignment"
  | "conversion"
  | "dangerous";

export type LeadTableActionPermissions = {
  canView: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canCreateOpportunity: boolean;
  canCreateQuote?: boolean;
  canConvert: boolean;
  /** leads.convert AND opportunities.convert — Lead → Customer + Opportunity. */
  canConvertWithOpportunity?: boolean;
  canArchive: boolean;
  canDelete: boolean;
};

export type LeadTableActionDef = {
  id: LeadTableActionId;
  /** i18n key under common.json */
  labelKey: string;
  group: LeadTableActionGroupId;
  destructive?: boolean;
  /** When true, action is listed but disabled (e.g. missing phone). */
  disabled?: boolean;
};

export type LeadTableActionSection = {
  group: LeadTableActionGroupId;
  labelKey: string;
  actions: LeadTableActionDef[];
};

const ACTION_GROUP_ORDER: LeadTableActionGroupId[] = [
  "navigation",
  "editing",
  "communication",
  "assignment",
  "conversion",
  "dangerous",
];

const GROUP_LABEL_KEYS: Record<LeadTableActionGroupId, string> = {
  navigation: "leads.table.rowActions.groups.navigation",
  editing: "leads.table.rowActions.groups.editing",
  communication: "leads.table.rowActions.groups.communication",
  assignment: "leads.table.rowActions.groups.assignment",
  conversion: "leads.table.rowActions.groups.conversion",
  dangerous: "leads.table.rowActions.groups.dangerous",
};

/** Matches Lead360 — converted leads must not offer Convert again. */
export function isLeadAlreadyConverted(input: {
  customerId?: string | null;
  lifecycleStatus?: string | null;
}): boolean {
  const status = (input.lifecycleStatus ?? "").trim().toLowerCase();
  // Only terminal convert status hides the action. A linked customerId alone can mean a
  // partial conversion that still needs Convert to finalize lifecycle status.
  return status === "converted" || status === "won";
}

/**
 * Matches backend createFromLead eligibility.
 * Qualified/converted alone is not enough — customer_id or an email (for unambiguous
 * tenant match) must be available so createFromLead can resolve identity.
 */
export function isLeadEligibleForOpportunityCreation(input: {
  isQualified?: boolean;
  customerId?: string | null;
  lifecycleStatus?: string | null;
  /** When true, backend may resolve customer via unambiguous email match. */
  hasEmail?: boolean;
}): boolean {
  const status = (input.lifecycleStatus ?? "").trim().toLowerCase();
  // Demo-led journeys require Complete Demo before Convert to Opportunity.
  if (status === "demo_scheduled") return false;
  const hasCustomer = Boolean(input.customerId?.trim());
  const canResolveCustomer = hasCustomer || Boolean(input.hasEmail);
  if (!canResolveCustomer) return false;
  if (hasCustomer) return true;
  if (input.isQualified) return true;
  // Stage lifecycle can be qualified while the denormalized flag lags behind.
  return status === "qualified" || status === "demo_completed";
}

const QUOTE_READY_LIFECYCLES = new Set([
  "demo_completed",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "converted",
  "closed",
]);

export function isLeadReadyForQuote(lifecycleStatus: string | null | undefined): boolean {
  return QUOTE_READY_LIFECYCLES.has((lifecycleStatus ?? "").trim().toLowerCase());
}

export function resolveLeadTableActions(input: {
  permissions: LeadTableActionPermissions;
  hasPhone: boolean;
  hasEmail: boolean;
  isConverted?: boolean;
  isQualified?: boolean;
  customerId?: string | null;
  lifecycleStatus?: string | null;
}): LeadTableActionDef[] {
  const { permissions: p, hasPhone, hasEmail, lifecycleStatus = null } = input;
  const actions: LeadTableActionDef[] = [];

  if (p.canView) {
    actions.push({
      id: "openLead360",
      labelKey: "leads.table.rowActions.openLead360",
      group: "navigation",
    });
  }
  if (p.canEdit) {
    actions.push({ id: "edit", labelKey: "leads.table.rowActions.edit", group: "editing" });
    actions.push({
      id: "createActivity",
      labelKey: "leads.table.rowActions.createActivity",
      group: "editing",
    });
    const status = (lifecycleStatus ?? "").trim().toLowerCase();
    if (status === "demo_scheduled") {
      actions.push({
        id: "completeDemo",
        labelKey: "leads.table.rowActions.completeDemo",
        group: "editing",
      });
    }
  }
  if (p.canView) {
    if (hasPhone) {
      actions.push({ id: "call", labelKey: "leads.table.rowActions.call", group: "communication" });
      actions.push({
        id: "whatsapp",
        labelKey: "leads.table.rowActions.whatsapp",
        group: "communication",
      });
    }
    if (hasEmail) {
      actions.push({
        id: "email",
        labelKey: "leads.table.rowActions.email",
        group: "communication",
      });
    }
  }
  if (p.canAssign) {
    actions.push({
      id: "assign",
      labelKey: "leads.table.rowActions.assign",
      group: "assignment",
    });
  }
  if (p.canCreateQuote) {
    actions.push({
      id: "createQuote",
      labelKey: "leads.table.rowActions.createQuote",
      group: "conversion",
      disabled: !isLeadReadyForQuote(lifecycleStatus),
    });
  }
  if (p.canArchive) {
    actions.push({
      id: "archive",
      labelKey: "leads.table.rowActions.archive",
      group: "dangerous",
    });
  }
  if (p.canDelete) {
    actions.push({
      id: "delete",
      labelKey: "leads.table.rowActions.delete",
      group: "dangerous",
      destructive: true,
    });
  }

  return actions;
}

/** Group resolved actions into enterprise menu sections (empty groups omitted). */
export function groupLeadTableActions(actions: LeadTableActionDef[]): LeadTableActionSection[] {
  const byGroup = new Map<LeadTableActionGroupId, LeadTableActionDef[]>();
  for (const action of actions) {
    const list = byGroup.get(action.group) ?? [];
    list.push(action);
    byGroup.set(action.group, list);
  }

  return ACTION_GROUP_ORDER.flatMap((group) => {
    const sectionActions = byGroup.get(group);
    if (!sectionActions?.length) return [];
    return [
      {
        group,
        labelKey: GROUP_LABEL_KEYS[group],
        actions: sectionActions,
      },
    ];
  });
}
