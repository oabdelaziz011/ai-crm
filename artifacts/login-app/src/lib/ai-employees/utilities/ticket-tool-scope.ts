import { TICKET_TOOL_KEYS, type TicketToolKey } from "@workspace/ai-tool-router";

export const TICKET_CAPABILITY_TAG = "capability:tickets";

const TICKET_PERMISSION_CODES = [
  "tickets.view",
  "tickets.create",
  "tickets.edit",
  "tickets.assign",
  "tickets.comment",
  "tickets.close",
  "tickets.manage",
] as const;

export function isTicketToolKey(toolKey: string): toolKey is TicketToolKey {
  return (TICKET_TOOL_KEYS as readonly string[]).includes(toolKey);
}

export function employeeHasTicketCapability(input: {
  tags: string[];
  allowedToolKeys: string[];
}): boolean {
  if (input.tags.includes(TICKET_CAPABILITY_TAG)) return true;
  return input.allowedToolKeys.some((key) => isTicketToolKey(key));
}

export function resolveTicketToolKeysForEmployee(input: {
  tags: string[];
  allowedToolKeys: string[];
}): string[] {
  if (!employeeHasTicketCapability(input)) {
    return input.allowedToolKeys.filter((key) => !isTicketToolKey(key));
  }

  const selected = new Set(input.allowedToolKeys);
  if (input.tags.includes(TICKET_CAPABILITY_TAG)) {
    for (const key of TICKET_TOOL_KEYS) {
      selected.add(key);
    }
  }

  return [...selected];
}

export function filterTicketToolsByPermissions(input: {
  toolKeys: string[];
  hasPermission: (code: string) => boolean;
  isSuperAdmin?: boolean;
}): string[] {
  if (input.isSuperAdmin) return input.toolKeys;

  const hasAnyTicketPermission = TICKET_PERMISSION_CODES.some((code) => input.hasPermission(code));
  if (!hasAnyTicketPermission) {
    return input.toolKeys.filter((key) => !isTicketToolKey(key));
  }

  return input.toolKeys;
}

export function buildTicketToolPromptHint(enabledTicketTools: string[]): string | null {
  if (enabledTicketTools.length === 0) return null;

  const hasSearch = enabledTicketTools.includes("search_ticket");
  const hasCreate = enabledTicketTools.includes("create_ticket");

  return [
    "CRITICAL TICKET ACTION RULES:",
    `Available ticket tools: ${enabledTicketTools.join(", ")}.`,
    hasSearch
      ? "- When the customer asks to see/list their tickets (تذاكري / my tickets): call search_ticket without a ticket number — results are scoped to the trusted customer only."
      : null,
    hasSearch
      ? "- When the customer asks to track one complaint by number: call search_ticket with query set to that exact number, then reply with status/priority/dates only."
      : null,
    hasSearch
      ? "- Never say you cannot search/track tickets (ليس لدي القدرة على البحث / لا يمكنني تتبع الشكاوى) while search_ticket is available — ask for the ticket number instead."
      : null,
    hasSearch
      ? "- NEVER tell the customer the ticket subject/topic or description (الموضوع / وصف الشكوى). Share status and operational details only."
      : null,
    hasCreate
      ? "- Use create_ticket only for a NEW complaint. Do not create a ticket just to answer a status/number question."
      : null,
    "- Use assign_ticket for handoffs, add_ticket_comment for internal notes, and close_ticket when resolved.",
  ]
    .filter(Boolean)
    .join("\n");
}
