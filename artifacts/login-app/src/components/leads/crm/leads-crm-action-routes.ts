/**
 * Maps Lead table menu actions to the intended UX route/command kind.
 * Pure — used by tests to lock navigation contracts without mounting React.
 */

import type { LeadTableActionId } from "./leads-crm-row-actions.ts";

export type LeadTableActionRoute =
  | { kind: "openLead360"; tab: "overview" | "activity" | "ai" }
  | { kind: "openDialog"; dialog: "edit" | "assign" | "activity" | "deleteConfirm" }
  | { kind: "command"; command: "createOpportunity" | "convert" | "archive" }
  | { kind: "openOpportunity360"; after: "createFromLead" }
  | { kind: "external"; channel: "call" | "whatsapp" | "email" }
  | { kind: "whatsapp"; channel: "platform-or-external" };

export function routeLeadTableAction(action: LeadTableActionId): LeadTableActionRoute {
  switch (action) {
    case "openLead360":
      return { kind: "openLead360", tab: "overview" };
    case "edit":
      return { kind: "openDialog", dialog: "edit" };
    case "createActivity":
      return { kind: "openDialog", dialog: "activity" };
    case "createOpportunity":
      return { kind: "openOpportunity360", after: "createFromLead" };
    case "call":
      return { kind: "external", channel: "call" };
    case "whatsapp":
      return { kind: "whatsapp", channel: "platform-or-external" };
    case "email":
      return { kind: "external", channel: "email" };
    case "assign":
      return { kind: "openDialog", dialog: "assign" };
    case "convert":
      return { kind: "command", command: "convert" };
    case "archive":
      return { kind: "command", command: "archive" };
    case "delete":
      return { kind: "openDialog", dialog: "deleteConfirm" };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
