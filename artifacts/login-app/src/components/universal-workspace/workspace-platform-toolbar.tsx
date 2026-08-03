import { Command, LayoutGrid, Search, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import { Button } from "@/components/ui/button";
import { WorkspaceNotificationCenter } from "./workspace-notification-center";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function WorkspacePlatformToolbar() {
  const { t } = useTranslation("common");
  const { openCommand, openSearch, openPersonalization, templateKey, setTemplateKey, snapshot } = useWorkspacePlatform();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-3 py-2 backdrop-blur-sm">
      <LayoutGrid className="size-4 shrink-0 text-primary" />
      <span className="text-xs font-semibold">{t("workspacePlatform.toolbar.title")}</span>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <select
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          className="h-8 rounded-lg border border-border/60 bg-background/50 px-2 text-xs"
        >
          {(snapshot?.templates ?? []).map((tpl) => (
            <option key={tpl.key} value={tpl.key}>
              {t(`workspacePlatform.${tpl.labelKey}`)}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={openSearch}>
          <Search className="size-3.5" />
          <span className="hidden sm:inline">{t("workspacePlatform.toolbar.search")}</span>
          <span className="shell-kbd hidden md:inline-flex">/</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={openCommand}>
          <Command className="size-3.5" />
          <span className="hidden sm:inline">{t("workspacePlatform.toolbar.commands")}</span>
          <span className="shell-kbd hidden md:inline-flex">{isMac ? "⌘K" : "Ctrl+K"}</span>
        </Button>
        <WorkspaceNotificationCenter />
        <Button variant="ghost" size="icon" className="size-8" onClick={openPersonalization}>
          <Settings2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
