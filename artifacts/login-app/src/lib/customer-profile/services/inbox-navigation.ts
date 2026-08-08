import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import { toDashboardAbsolutePath } from "@/lib/routing";

export const TEAM_INBOX_FOCUS_STORAGE_KEY = "customer-profile:inbox-focus-conversation";

type InboxFocusListener = (conversationId: string) => void;

let inboxFocusListener: InboxFocusListener | null = null;

export function subscribeTeamInboxConversationFocus(listener: InboxFocusListener): () => void {
  inboxFocusListener = listener;
  return () => {
    if (inboxFocusListener === listener) {
      inboxFocusListener = null;
    }
  };
}

export function requestTeamInboxConversationFocus(conversationId: string): boolean {
  if (!inboxFocusListener) return false;
  inboxFocusListener(conversationId);
  return true;
}

export function queueTeamInboxConversationFocus(conversationId: string): void {
  sessionStorage.setItem(TEAM_INBOX_FOCUS_STORAGE_KEY, conversationId);
}

export function consumeQueuedTeamInboxConversationFocus(): string | null {
  const conversationId = sessionStorage.getItem(TEAM_INBOX_FOCUS_STORAGE_KEY);
  if (conversationId) {
    sessionStorage.removeItem(TEAM_INBOX_FOCUS_STORAGE_KEY);
  }
  return conversationId;
}

/** Nest-relative path — only safe when already under the dashboard router root. */
export function getTeamInboxNestedPath(): string {
  return getDashboardRouteById("omnichannel").nestedPath;
}

/**
 * Root-escaped dashboard path for Team Inbox.
 * Safe from nested routers (e.g. `/dashboard/operations/...`).
 */
export function getTeamInboxDashboardHref(): string {
  return `~${toDashboardAbsolutePath(getTeamInboxNestedPath())}`;
}
