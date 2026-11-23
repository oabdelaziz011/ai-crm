/**
 * Phase 1B — Task → ValueOR Permission Catalog codes.
 * Codes must match locales/{en,ar,de}/permission-catalog.json and RBAC rows.
 * Do not invent codes.
 */
import type { DashboardSectionId } from "@/config/dashboard-route-registry";

export type GuideTaskId =
  | "customers.view"
  | "customers.create"
  | "customers.edit"
  | "customers.delete"
  | "tickets.view"
  | "tickets.create"
  | "tickets.edit"
  | "leads.view"
  | "leads.create"
  | "leads.edit"
  | "opportunities.view"
  | "opportunities.create"
  | "opportunities.edit"
  | "bookings.view"
  | "bookings.create"
  | "bookings.edit"
  | "calendar.view"
  | "invoices.view"
  | "invoices.create"
  | "invoices.edit"
  | "whatsapp.view"
  | "whatsapp.manage"
  | "email.view"
  | "email.settings"
  | "omnichannel.view"
  | "website.view"
  | "website.manage"
  | "organization.view"
  | "users.view"
  | "users.create"
  | "roles.view"
  | "roles.edit"
  | "ai_assistant.view"
  | "ai_assistant.edit"
  | "ai_employees.view"
  | "knowledge.view"
  | "company.view"
  | "company.update"
  | "settings.view"
  | "channels.view"
  | "quotes.view"
  | "quotes.create"
  | "automation.view"
  | "dashboard.home";

export type GuidePermissionRequirement = {
  /** All listed codes required (AND). Empty = no RBAC gate beyond authentication. */
  allOf: readonly string[];
  /** Preferred destination route id when navigation is appropriate. */
  routeId?: DashboardSectionId;
};

/**
 * Authoritative task → permission mapping using existing catalog codes.
 * customers.update exists for agent tools; UI edit uses customers.edit.
 */
export const GUIDE_TASK_PERMISSIONS: Readonly<Record<GuideTaskId, GuidePermissionRequirement>> =
  Object.freeze({
    "dashboard.home": { allOf: [] },
    "customers.view": { allOf: ["customers.view"], routeId: "customers" },
    "customers.create": { allOf: ["customers.view", "customers.create"], routeId: "customers" },
    "customers.edit": { allOf: ["customers.view", "customers.edit"], routeId: "customers" },
    "customers.delete": { allOf: ["customers.view", "customers.delete"], routeId: "customers" },
    "tickets.view": { allOf: ["tickets.view"], routeId: "tickets" },
    "tickets.create": { allOf: ["tickets.view", "tickets.create"], routeId: "tickets" },
    "tickets.edit": { allOf: ["tickets.view", "tickets.edit"], routeId: "tickets" },
    "leads.view": { allOf: ["leads.view"], routeId: "leads" },
    "leads.create": { allOf: ["leads.view", "leads.create"], routeId: "leads" },
    "leads.edit": { allOf: ["leads.view", "leads.edit"], routeId: "leads" },
    "opportunities.view": { allOf: ["opportunities.view"], routeId: "opportunities" },
    "opportunities.create": {
      allOf: ["opportunities.view", "opportunities.create"],
      routeId: "opportunities",
    },
    "opportunities.edit": {
      allOf: ["opportunities.view", "opportunities.edit"],
      routeId: "opportunities",
    },
    "bookings.view": { allOf: ["bookings.view"], routeId: "bookings" },
    "bookings.create": { allOf: ["bookings.view", "bookings.create"], routeId: "bookings" },
    "bookings.edit": { allOf: ["bookings.view", "bookings.edit"], routeId: "bookings" },
    "calendar.view": { allOf: ["bookings.view"], routeId: "calendar" },
    "invoices.view": { allOf: ["invoices.view"], routeId: "invoices" },
    "invoices.create": { allOf: ["invoices.view", "invoices.create"], routeId: "invoices" },
    "invoices.edit": { allOf: ["invoices.view", "invoices.edit"], routeId: "invoices" },
    "whatsapp.view": { allOf: ["whatsapp.view"], routeId: "whatsapp" },
    "whatsapp.manage": { allOf: ["whatsapp.view", "ai.whatsapp.manage"], routeId: "whatsapp" },
    "email.view": { allOf: ["email.view"], routeId: "email" },
    "email.settings": { allOf: ["email.view", "email.settings.manage"], routeId: "email" },
    "omnichannel.view": { allOf: ["ai.conversations.view"], routeId: "omnichannel" },
    "website.view": { allOf: ["web_presence.view"], routeId: "website" },
    "website.manage": { allOf: ["web_presence.view", "web_presence.manage"], routeId: "website" },
    "organization.view": { allOf: ["organization.view"], routeId: "organization" },
    "users.view": { allOf: ["users.view"], routeId: "users" },
    "users.create": { allOf: ["users.view", "users.create"], routeId: "users" },
    "roles.view": { allOf: ["roles.view"], routeId: "roles" },
    "roles.edit": { allOf: ["roles.view", "roles.edit"], routeId: "roles" },
    "ai_assistant.view": { allOf: ["ai_assistant.view"], routeId: "ai-assistant" },
    "ai_assistant.edit": { allOf: ["ai_assistant.view", "ai_assistant.edit"], routeId: "ai-assistant" },
    "ai_employees.view": { allOf: ["agents.view"], routeId: "ai-employees" },
    "knowledge.view": { allOf: ["knowledge.view"], routeId: "knowledge" },
    "company.view": { allOf: ["company.view"], routeId: "company" },
    "company.update": { allOf: ["company.view", "company.update"], routeId: "company" },
    "settings.view": { allOf: ["settings.view"], routeId: "settings" },
    "channels.view": { allOf: ["channels.view"], routeId: "channels" },
    "quotes.view": { allOf: ["quotes.view"], routeId: "quotes" },
    "quotes.create": { allOf: ["quotes.view", "quotes.create"], routeId: "quotes" },
    "automation.view": { allOf: ["automation.view"], routeId: "automation" },
  });

export function getGuideTaskRequirement(taskId: GuideTaskId): GuidePermissionRequirement {
  return GUIDE_TASK_PERMISSIONS[taskId];
}

export function listGuideTaskIds(): GuideTaskId[] {
  return Object.keys(GUIDE_TASK_PERMISSIONS) as GuideTaskId[];
}
