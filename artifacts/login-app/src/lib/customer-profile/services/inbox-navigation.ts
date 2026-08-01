import { getDashboardRouteById } from "@/config/dashboard-route-registry";

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

export function getTeamInboxNestedPath(): string {
  return getDashboardRouteById("omnichannel").nestedPath;
}
