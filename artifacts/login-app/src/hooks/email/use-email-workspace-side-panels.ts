import { useCallback, useState } from "react";

const LIST_KEY = "email.workspace.listCollapsed";
const CONTEXT_KEY = "email.workspace.contextCollapsed";

function loadFlag(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function persistFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Independent collapse state for Email Workspace list + context columns. */
export function useEmailWorkspaceSidePanels() {
  const [listCollapsed, setListCollapsedState] = useState(() =>
    typeof window === "undefined" ? false : loadFlag(LIST_KEY),
  );
  const [contextCollapsed, setContextCollapsedState] = useState(() =>
    typeof window === "undefined" ? false : loadFlag(CONTEXT_KEY),
  );

  const setListCollapsed = useCallback((next: boolean) => {
    persistFlag(LIST_KEY, next);
    setListCollapsedState(next);
  }, []);

  const setContextCollapsed = useCallback((next: boolean) => {
    persistFlag(CONTEXT_KEY, next);
    setContextCollapsedState(next);
  }, []);

  const toggleListCollapsed = useCallback(() => {
    setListCollapsedState((prev) => {
      const next = !prev;
      persistFlag(LIST_KEY, next);
      return next;
    });
  }, []);

  const toggleContextCollapsed = useCallback(() => {
    setContextCollapsedState((prev) => {
      const next = !prev;
      persistFlag(CONTEXT_KEY, next);
      return next;
    });
  }, []);

  return {
    listCollapsed,
    contextCollapsed,
    setListCollapsed,
    setContextCollapsed,
    toggleListCollapsed,
    toggleContextCollapsed,
  };
}
