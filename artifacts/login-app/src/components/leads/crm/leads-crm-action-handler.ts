/**
 * Executes Lead table menu actions from routed intents.
 * Pure wiring — delegates to existing commands/dialogs only.
 */

import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { routeLeadTableAction, type LeadTableActionRoute } from "./leads-crm-action-routes.ts";
import type { LeadTableActionId } from "./leads-crm-row-actions.ts";
import {
  externalWhatsAppUrl,
  resolveLeadWhatsAppRoute,
} from "./leads-crm-whatsapp.ts";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result.ts";

export type LeadTableActionHandlerDeps = {
  row: LeadWorkspaceRow;
  t: (key: string, options?: Record<string, unknown>) => string;
  toast: (options: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void;
  failToast: (title: string, error?: unknown) => void;
  commands: {
    convert: {
      mutateAsync: (input: { leadId: string }) => Promise<{ opportunityId?: string | null }>;
    };
    archive: { mutateAsync: (input: { leadId: string }) => Promise<unknown> };
  };
  openLead360: (row: LeadWorkspaceRow, tab: "overview" | "activity" | "ai") => void;
  setOpportunityId: (id: string) => void;
  openCreateOpportunityDialog: (row: LeadWorkspaceRow) => void;
  setEditLead: (row: LeadWorkspaceRow) => void;
  setEditOpen: (open: boolean) => void;
  setActionLead: (row: LeadWorkspaceRow | null) => void;
  setAssignOpen: (open: boolean) => void;
  setActivityOpen: (open: boolean) => void;
  setDeleteOpen: (open: boolean) => void;
  setSelectedLead: (updater: (current: LeadWorkspaceRow | null) => LeadWorkspaceRow | null) => void;
  whatsApp: {
    hasIntegration: boolean;
    channelId: string | null;
    companyId: string | undefined;
    openPlatform: (input: {
      customerId?: string | null;
      phone: string;
      leadId: string;
    }) => Promise<void>;
  };
};

export function routeForLeadTableAction(action: LeadTableActionId): LeadTableActionRoute {
  return routeLeadTableAction(action);
}

export async function executeLeadTableActionRoute(
  route: LeadTableActionRoute,
  deps: LeadTableActionHandlerDeps,
): Promise<void> {
  const { row, t, failToast, toast, commands } = deps;

  switch (route.kind) {
    case "openLead360":
      deps.openLead360(row, route.tab);
      return;
    case "openDialog":
      if (route.dialog === "edit") {
        deps.setEditLead(row);
        deps.setEditOpen(true);
        return;
      }
      if (route.dialog === "activity") {
        deps.setActionLead(row);
        deps.setActivityOpen(true);
        return;
      }
      if (route.dialog === "assign") {
        deps.setActionLead(row);
        deps.setAssignOpen(true);
        return;
      }
      if (route.dialog === "deleteConfirm") {
        deps.setActionLead(row);
        deps.setDeleteOpen(true);
        return;
      }
      if (route.dialog === "createOpportunity") {
        deps.openCreateOpportunityDialog(row);
        return;
      }
      return;
    case "openOpportunity360":
      return;
    case "external":
      if (route.channel === "call") {
        if (!row.phone?.trim()) {
          failToast(t("leads.table.errors.missingPhone"));
          return;
        }
        window.open(`tel:${row.phone}`, "_self");
        return;
      }
      if (route.channel === "email") {
        if (!row.email?.trim()) {
          failToast(t("leads.table.errors.missingEmail"));
          return;
        }
        window.open(`mailto:${row.email}`, "_self");
        return;
      }
      return;
    case "whatsapp": {
      const waRoute = resolveLeadWhatsAppRoute({
        hasWhatsAppIntegration: deps.whatsApp.hasIntegration,
        phone: row.phone,
        customerId: row.customerId,
      });
      if (!waRoute) {
        failToast(t("leads.table.errors.missingPhone"));
        return;
      }
      if (waRoute.kind === "external") {
        window.open(externalWhatsAppUrl(waRoute.phone), "_blank");
        return;
      }
      try {
        await deps.whatsApp.openPlatform({
          customerId: waRoute.customerId,
          phone: waRoute.phone,
          leadId: row.id,
        });
      } catch {
        window.open(externalWhatsAppUrl(waRoute.phone), "_blank");
        toast({ title: t("leads.table.errors.whatsappPlatformFailed") });
      }
      return;
    }
    case "command":
      if (route.command === "convert") {
        try {
          const result = await commands.convert.mutateAsync({ leadId: row.id });
          toast({ title: t("leads.kanban.actions.converted") });
          if (result.opportunityId) {
            deps.setOpportunityId(result.opportunityId);
          }
        } catch (error) {
          failToast(t("leads.kanban.actions.convertFailed"), resolveApplicationErrorMessage(error));
        }
        return;
      }
      if (route.command === "archive") {
        try {
          await commands.archive.mutateAsync({ leadId: row.id });
          toast({ title: t("leads.table.rowActions.archived") });
          deps.setSelectedLead((current) => (current?.id === row.id ? null : current));
        } catch (error) {
          failToast(t("leads.table.errors.archiveFailed"), error);
        }
        return;
      }
      return;
    default:
      failToast(t("leads.table.errors.actionUnsupported"));
  }
}

export async function executeLeadTableAction(
  action: LeadTableActionId,
  deps: LeadTableActionHandlerDeps,
): Promise<void> {
  return executeLeadTableActionRoute(routeLeadTableAction(action), deps);
}
