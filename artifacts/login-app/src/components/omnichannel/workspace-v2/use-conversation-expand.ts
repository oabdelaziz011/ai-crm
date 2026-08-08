import { useCallback, useEffect, useRef, useState } from "react";
import {
  INBOX_PANEL_DEFAULT,
  INBOX_WIDTH_STORAGE_KEY,
} from "@/components/omnichannel/workspace-v2/use-inbox-panel-width";

export const CONVERSATION_EXPANDED_STORAGE_KEY = "desk.conversation.expanded";

function loadExpanded(): boolean {
  try {
    const raw = localStorage.getItem(CONVERSATION_EXPANDED_STORAGE_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function persistExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(CONVERSATION_EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function loadInboxWidth(): number {
  try {
    const raw = localStorage.getItem(INBOX_WIDTH_STORAGE_KEY);
    if (!raw) return INBOX_PANEL_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? INBOX_PANEL_DEFAULT : parsed;
  } catch {
    return INBOX_PANEL_DEFAULT;
  }
}

/**
 * Expand conversation inside the workspace (not browser fullscreen).
 * Updates CSS vars / data attrs on the workspace body — no list/message re-render.
 */
export function useConversationExpand(getBody: () => HTMLElement | null) {
  const expandedRef = useRef(loadExpanded());
  const [expanded, setExpanded] = useState(expandedRef.current);

  const applyExpandedLayout = useCallback(
    (next: boolean) => {
      const body = getBody();
      if (!body) return;

      if (next) {
        body.setAttribute("data-conversation-expanded", "true");
        const rect = body.getBoundingClientRect();
        const nav = body.querySelector<HTMLElement>(".ws-nav-rail");
        const crm = body.querySelector<HTMLElement>(".ws-intelligence-panel, .ws-intelligence-rail");
        const reserved =
          (nav?.getBoundingClientRect().width ?? 0) + (crm?.getBoundingClientRect().width ?? 0);
        const available = Math.max(0, rect.width - reserved);
        // Inbox ~20% of Conversation+Inbox region; Conversation takes the rest (~80%).
        const inboxWidth = Math.max(160, Math.round(available * 0.2));
        body.style.setProperty("--ws-list-width", `${inboxWidth}px`);
      } else {
        body.removeAttribute("data-conversation-expanded");
        const restored =
          window.innerWidth >= 1400 ? loadInboxWidth() : INBOX_PANEL_DEFAULT;
        body.style.setProperty("--ws-list-width", `${restored}px`);
      }
    },
    [getBody],
  );

  useEffect(() => {
    applyExpandedLayout(expandedRef.current);
  }, [applyExpandedLayout]);

  useEffect(() => {
    const onResize = () => {
      if (expandedRef.current) applyExpandedLayout(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyExpandedLayout]);

  const setConversationExpanded = useCallback(
    (next: boolean) => {
      expandedRef.current = next;
      persistExpanded(next);
      applyExpandedLayout(next);
      setExpanded(next);
    },
    [applyExpandedLayout],
  );

  const toggleConversationExpanded = useCallback(() => {
    const next = !expandedRef.current;
    setConversationExpanded(next);
    return next;
  }, [setConversationExpanded]);

  return {
    conversationExpanded: expanded,
    setConversationExpanded,
    toggleConversationExpanded,
    isConversationExpanded: () => expandedRef.current,
  };
}
