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
  const hasComment = enabledTicketTools.includes("add_ticket_comment");
  const hasChangeStatus = enabledTicketTools.includes("change_ticket_status");
  const hasChangePriority = enabledTicketTools.includes("change_ticket_priority");
  const hasClose = enabledTicketTools.includes("close_ticket");
  const hasAssign = enabledTicketTools.includes("assign_ticket");

  return [
    "CRITICAL TICKET ACTION RULES:",
    `Available ticket tools: ${enabledTicketTools.join(", ")}.`,
    "Use ONLY the tools listed above. If a ticket tool is not listed, do not claim you can do that action.",
    hasSearch
      ? "- When the customer asks to see/list their tickets (تذاكري / my tickets): call search_ticket without a ticket number — results are scoped to the trusted customer only."
      : null,
    hasSearch
      ? "- Status/track questions (حالة/حاله الشكوى، اعرف حالة الشكوى): FIRST ask for their ticket number if missing, then call search_ticket. Never create_ticket for status."
      : null,
    hasSearch
      ? "- Never say you cannot search/track tickets (ليس لدي القدرة على البحث / لا يمكنني تتبع الشكاوى) while search_ticket is available — ask for the ticket number instead."
      : null,
    hasSearch
      ? "- NEVER tell the customer the ticket subject/topic or description (الموضوع / وصف الشكوى). Share status and operational details only."
      : null,
    hasCreate
      ? "- Use create_ticket only for a NEW complaint (افتح/أقدم شكوى) after the customer provided the full complaint text. Ask for the text first if missing. Set description to that text and choose priority (low/normal/high/urgent) from how severe it sounds."
      : null,
    hasCreate
      ? "- Do not create a ticket for status, add-comment (اضيف شكوى/تعليق), or change-status (اغير حالة الشكوى) — those are other tools."
      : null,
    hasComment
      ? "- Add comment (اضيف شكوى / ضيف تعليق): if multiple open tickets, ask which ticket number; if one, confirm the number then ask for the comment; after success say the comment was added on that ticket number."
      : null,
    hasChangeStatus || hasChangePriority || hasClose
      ? "- Change status/priority (اغير حالة الشكوى / خليها مقفولة / عاجلة): use change_ticket_status / change_ticket_priority / close_ticket — never search_bookings or booking tools."
      : null,
    hasAssign ? "- Use assign_ticket for handoffs to a human agent." : null,
    hasClose ? "- Use close_ticket when the customer asks to close/resolve a ticket." : null,
  ]
    .filter(Boolean)
    .join("\n");
}
