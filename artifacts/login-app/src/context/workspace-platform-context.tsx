import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { GlobalSearchResult, WorkspaceContext, WorkspaceDesignerState } from "@workspace/universal-workspace-platform";
import {
  designerEngine,
  favoritesEngine,
  notificationEngine,
  personalizationEngine,
  workspacePlatformOrchestrator,
} from "@workspace/universal-workspace-platform";

export type WorkspacePlatformRole = "receptionist" | "cashier" | "nurse" | "manager";

type WorkspacePlatformContextValue = {
  role: WorkspacePlatformRole;
  templateKey: string;
  setTemplateKey: (key: string) => void;
  commandOpen: boolean;
  searchOpen: boolean;
  notificationsOpen: boolean;
  personalizationOpen: boolean;
  openCommand: () => void;
  closeCommand: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleNotifications: () => void;
  closeNotifications: () => void;
  openPersonalization: () => void;
  closePersonalization: () => void;
  snapshot: ReturnType<typeof workspacePlatformOrchestrator.buildSnapshot> | null;
  personalization: ReturnType<typeof personalizationEngine.get>;
  search: (query: string) => ReturnType<typeof workspacePlatformOrchestrator.search>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unpinFavorite: (id: string) => void;
  designerState: WorkspaceDesignerState | null;
  setDesignerState: (state: WorkspaceDesignerState) => void;
  addDesignerBlock: (paletteItemId: string) => void;
  removeDesignerBlock: (blockId: string) => void;
  selectedSearchResult: GlobalSearchResult | null;
  setSelectedSearchResult: (r: GlobalSearchResult | null) => void;
  workspaceContext: WorkspaceContext;
};

const WorkspacePlatformContext = createContext<WorkspacePlatformContextValue | null>(null);

export function WorkspacePlatformProvider({
  children,
  userId = "demo_user",
  role = "manager",
  templateKey: initialTemplate = "clinic",
}: {
  children: ReactNode;
  userId?: string;
  role?: WorkspacePlatformRole;
  templateKey?: string;
}) {
  const [templateKey, setTemplateKey] = useState(initialTemplate);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [notifTick, setNotifTick] = useState(0);
  const [designerState, setDesignerState] = useState<WorkspaceDesignerState | null>(null);
  const [selectedSearchResult, setSelectedSearchResult] = useState<GlobalSearchResult | null>(null);

  const workspaceContext: WorkspaceContext = useMemo(
    () => ({ entityType: "customer", entityId: "demo", entityLabel: "Workspace", templateKey }),
    [templateKey],
  );

  const snapshot = useMemo(
    () => workspacePlatformOrchestrator.buildSnapshot(workspaceContext, userId, role),
    [workspaceContext, userId, role, notifTick],
  );

  const personalization = useMemo(() => personalizationEngine.get(userId), [userId]);

  const search = useCallback((query: string) => workspacePlatformOrchestrator.search(query), []);

  const markNotificationRead = useCallback((id: string) => {
    notificationEngine.markRead(id);
    setNotifTick((n) => n + 1);
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    notificationEngine.markAllRead();
    setNotifTick((n) => n + 1);
  }, []);

  const unpinFavorite = useCallback((id: string) => {
    favoritesEngine.unpin(id);
    setNotifTick((n) => n + 1);
  }, []);

  const addDesignerBlock = useCallback(
    (paletteItemId: string) => {
      const palette = designerEngine.getPalette();
      const item = palette.find((p) => p.id === paletteItemId);
      if (!item) return;
      setDesignerState((prev) => {
        const base = prev ?? designerEngine.createState("New Workspace", templateKey);
        return designerEngine.addBlock(base, item);
      });
    },
    [templateKey],
  );

  const removeDesignerBlock = useCallback((blockId: string) => {
    setDesignerState((prev) => (prev ? designerEngine.removeBlock(prev, blockId) : prev));
  }, []);

  const value = useMemo(
    (): WorkspacePlatformContextValue => ({
      role,
      templateKey,
      setTemplateKey,
      commandOpen,
      searchOpen,
      notificationsOpen,
      personalizationOpen,
      openCommand: () => setCommandOpen(true),
      closeCommand: () => setCommandOpen(false),
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      toggleNotifications: () => setNotificationsOpen((v) => !v),
      closeNotifications: () => setNotificationsOpen(false),
      openPersonalization: () => setPersonalizationOpen(true),
      closePersonalization: () => setPersonalizationOpen(false),
      snapshot,
      personalization,
      search,
      markNotificationRead,
      markAllNotificationsRead,
      unpinFavorite,
      designerState,
      setDesignerState,
      addDesignerBlock,
      removeDesignerBlock,
      selectedSearchResult,
      setSelectedSearchResult,
      workspaceContext,
    }),
    [
      role,
      templateKey,
      commandOpen,
      searchOpen,
      notificationsOpen,
      personalizationOpen,
      snapshot,
      personalization,
      search,
      markNotificationRead,
      markAllNotificationsRead,
      unpinFavorite,
      designerState,
      addDesignerBlock,
      removeDesignerBlock,
      selectedSearchResult,
      workspaceContext,
    ],
  );

  return <WorkspacePlatformContext.Provider value={value}>{children}</WorkspacePlatformContext.Provider>;
}

export function useWorkspacePlatform() {
  const ctx = useContext(WorkspacePlatformContext);
  if (!ctx) throw new Error("useWorkspacePlatform must be used within WorkspacePlatformProvider");
  return ctx;
}

export function useWorkspacePlatformOptional() {
  return useContext(WorkspacePlatformContext);
}
