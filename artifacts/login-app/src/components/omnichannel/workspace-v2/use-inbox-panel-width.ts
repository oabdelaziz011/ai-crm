import { useCallback, useEffect, useRef, useState } from "react";

/** Exact persistence key required by Sprint 3.10.7. */
export const INBOX_WIDTH_STORAGE_KEY = "desk.inbox.width";

export const INBOX_PANEL_MIN = 320;
export const INBOX_PANEL_MAX = 520;
export const INBOX_PANEL_DEFAULT = 340;
export const INBOX_RESIZE_MIN_VIEWPORT = 1400;
export const CONVERSATION_PANEL_MIN = 650;

function clampInboxWidth(width: number, maxAllowed = INBOX_PANEL_MAX): number {
  return Math.min(maxAllowed, Math.max(INBOX_PANEL_MIN, width));
}

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(INBOX_WIDTH_STORAGE_KEY);
    if (!raw) return INBOX_PANEL_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return INBOX_PANEL_DEFAULT;
    return clampInboxWidth(parsed);
  } catch {
    return INBOX_PANEL_DEFAULT;
  }
}

function persistWidth(width: number): void {
  try {
    localStorage.setItem(INBOX_WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Inbox width via CSS variable on the workspace body.
 * Drag updates the DOM only — no React state — so Conversation / CRM / list rows do not re-render.
 */
export function useInboxPanelWidth() {
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null);
  const persistedRef = useRef(loadWidth());
  const [resizeEnabled, setResizeEnabled] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= INBOX_RESIZE_MIN_VIEWPORT : true,
  );

  const applyWidth = useCallback((width: number) => {
    const node = workspaceBodyRef.current;
    if (!node) return;
    node.style.setProperty("--ws-list-width", `${width}px`);
  }, []);

  const resolveMaxWidth = useCallback(() => {
    const body = workspaceBodyRef.current;
    if (!body) return INBOX_PANEL_MAX;
    const rect = body.getBoundingClientRect();
    const nav = body.querySelector<HTMLElement>(".ws-nav-rail");
    const crm = body.querySelector<HTMLElement>(".ws-intelligence-panel, .ws-intelligence-rail");
    const divider = 4;
    const reserved =
      (nav?.getBoundingClientRect().width ?? 0) +
      (crm?.getBoundingClientRect().width ?? 0) +
      divider +
      CONVERSATION_PANEL_MIN;
    const roomForInbox = Math.floor(rect.width - reserved);
    return clampInboxWidth(Math.min(INBOX_PANEL_MAX, Math.max(INBOX_PANEL_MIN, roomForInbox)));
  }, []);

  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    workspaceBodyRef.current = node;
    if (!node) return;
    const enabled = window.innerWidth >= INBOX_RESIZE_MIN_VIEWPORT;
    node.style.setProperty(
      "--ws-list-width",
      `${enabled ? persistedRef.current : INBOX_PANEL_DEFAULT}px`,
    );
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${INBOX_RESIZE_MIN_VIEWPORT}px)`);
    const sync = () => {
      const body = workspaceBodyRef.current;
      // Expanded conversation owns inbox width via CSS — do not fight it.
      if (body?.getAttribute("data-conversation-expanded") === "true") {
        setResizeEnabled(false);
        return;
      }
      const enabled = mq.matches;
      setResizeEnabled(enabled);
      if (enabled) {
        applyWidth(clampInboxWidth(persistedRef.current, resolveMaxWidth()));
      } else {
        applyWidth(INBOX_PANEL_DEFAULT);
      }
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, [applyWidth, resolveMaxWidth]);

  const startResize = useCallback(
    (clientX: number) => {
      if (!resizeEnabled) return;
      const body = workspaceBodyRef.current;
      if (!body || body.getAttribute("data-conversation-expanded") === "true") return;

      body.setAttribute("data-inbox-resizing", "true");
      const bodyRect = body.getBoundingClientRect();
      const maxAllowed = resolveMaxWidth();

      const onMove = (event: PointerEvent) => {
        // Inbox sits on the trailing (right in LTR shell) edge.
        const next = clampInboxWidth(bodyRect.right - event.clientX, maxAllowed);
        persistedRef.current = next;
        applyWidth(next);
      };

      const onUp = () => {
        body.removeAttribute("data-inbox-resizing");
        persistWidth(persistedRef.current);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      onMove({ clientX } as PointerEvent);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyWidth, resizeEnabled, resolveMaxWidth],
  );

  const getBody = useCallback(() => workspaceBodyRef.current, []);

  return { resizeEnabled, startResize, bodyRef, getBody };
}
