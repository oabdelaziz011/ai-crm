import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SIDEBAR_COLLAPSED_KEY = "valueor.sidebar.collapsed";

type AppShellContextValue = {
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  copilotOpen: boolean;
  toggleCopilot: () => void;
  setCopilotOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsedPreference);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleCopilot = useCallback(() => {
    setCopilotOpen((prev) => !prev);
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebarCollapsed,
      mobileSidebarOpen,
      setMobileSidebarOpen,
      copilotOpen,
      toggleCopilot,
      setCopilotOpen,
      commandPaletteOpen,
      setCommandPaletteOpen,
      openCommandPalette,
    }),
    [
      sidebarCollapsed,
      toggleSidebarCollapsed,
      mobileSidebarOpen,
      copilotOpen,
      toggleCopilot,
      commandPaletteOpen,
      openCommandPalette,
    ],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return ctx;
}
