/**
 * Pure helpers for Lead CRM table row actions (RBAC + contact availability).
 * Kept free of React so unit tests can run without DOM/path aliases.
 */

export type LeadTableActionId =
  | "openLead360"
  | "edit"
  | "createActivity"
  | "createOpportunity"
  | "call"
  | "whatsapp"
  | "email"
  | "assign"
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
  canConvert: boolean;
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

export function resolveLeadTableActions(input: {
  permissions: LeadTableActionPermissions;
  hasPhone: boolean;
  hasEmail: boolean;
}): LeadTableActionDef[] {
  const { permissions: p, hasPhone, hasEmail } = input;
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
  if (p.canEdit) {
    actions.push({
      id: "createOpportunity",
      labelKey: "leads.table.rowActions.createOpportunity",
      group: "conversion",
    });
  }
  if (p.canConvert) {
    actions.push({
      id: "convert",
      labelKey: "leads.table.rowActions.convert",
      group: "conversion",
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
