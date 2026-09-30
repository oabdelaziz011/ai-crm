import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const EMAIL_WORKSPACE_EXPANDED_STORAGE_KEY = "email.workspace.expanded";

function loadExpanded(): boolean {
  try {
    const raw = localStorage.getItem(EMAIL_WORKSPACE_EXPANDED_STORAGE_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function persistExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(EMAIL_WORKSPACE_EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type EmailWorkspaceExpandValue = {
  expanded: boolean;
  setExpanded: (next: boolean) => void;
  toggleExpanded: () => void;
};

const EmailWorkspaceExpandContext = createContext<EmailWorkspaceExpandValue | null>(null);

export function EmailWorkspaceExpandProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpandedState] = useState(loadExpanded);

  const setExpanded = useCallback((next: boolean) => {
    persistExpanded(next);
    setExpandedState(next);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpandedState((prev) => {
      const next = !prev;
      persistExpanded(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, setExpanded]);

  return (
    <EmailWorkspaceExpandContext.Provider value={{ expanded, setExpanded, toggleExpanded }}>
      {children}
    </EmailWorkspaceExpandContext.Provider>
  );
}

/** Safe outside provider — expand stays local no-ops (tests / non-email shells). */
export function useEmailWorkspaceExpand(): EmailWorkspaceExpandValue {
  const ctx = useContext(EmailWorkspaceExpandContext);
  const [localExpanded, setLocalExpanded] = useState(false);
  if (ctx) return ctx;
  return {
    expanded: localExpanded,
    setExpanded: setLocalExpanded,
    toggleExpanded: () => setLocalExpanded((v) => !v),
  };
}
