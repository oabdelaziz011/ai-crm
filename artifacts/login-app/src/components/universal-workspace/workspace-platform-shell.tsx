import { type ReactNode } from "react";
import { WorkspacePlatformProvider } from "@/context/workspace-platform-context";
import { useWorkspaceKeyboard } from "@/hooks/universal-workspace";
import { WorkspaceCommandCenter } from "./workspace-command-center";
import { WorkspaceGlobalSearch } from "./workspace-global-search";
import { WorkspacePersonalizationPanel } from "./workspace-personalization-panel";
import { WorkspacePlatformToolbar } from "./workspace-platform-toolbar";
import { WorkspaceFavoritesBar } from "./workspace-favorites-bar";

function WorkspaceKeyboardLayer() {
  useWorkspaceKeyboard();
  return null;
}

export function WorkspacePlatformShell({
  children,
  templateKey = "clinic",
  showToolbar = true,
  showFavorites = true,
}: {
  children: ReactNode;
  templateKey?: string;
  showToolbar?: boolean;
  showFavorites?: boolean;
}) {
  return (
    <WorkspacePlatformProvider templateKey={templateKey}>
      <WorkspaceKeyboardLayer />
      <div className="space-y-2 animate-in fade-in duration-300">
        {showToolbar && <WorkspacePlatformToolbar />}
        {showFavorites && <WorkspaceFavoritesBar />}
        {children}
      </div>
      <WorkspaceCommandCenter />
      <WorkspaceGlobalSearch />
      <WorkspacePersonalizationPanel />
    </WorkspacePlatformProvider>
  );
}
