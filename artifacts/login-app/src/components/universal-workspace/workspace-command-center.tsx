import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { WorkspaceCommand } from "@workspace/universal-workspace-platform";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Sparkles, Zap } from "lucide-react";

const CATEGORY_ORDER = ["create", "action", "navigate", "search", "ai", "workspace"] as const;

export function WorkspaceCommandCenter() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { commandOpen, closeCommand, snapshot } = useWorkspacePlatform();
  const [query, setQuery] = useState("");

  const commands = useMemo(() => {
    const all = snapshot?.commands ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        t(`workspacePlatform.${c.labelKey}`).toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)),
    );
  }, [snapshot?.commands, query, t]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkspaceCommand[]>();
    for (const cmd of commands) {
      const list = map.get(cmd.category) ?? [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((cat) => ({
      category: cat,
      items: map.get(cat)!,
    }));
  }, [commands]);

  const runCommand = (cmd: WorkspaceCommand) => {
    closeCommand();
    setQuery("");
    switch (cmd.actionKey) {
      case "nav_queue":
        // Nest-relative: shell is mounted under /dashboard/operations
        setLocation("/queue");
        break;
      case "nav_hub":
        setLocation("/hub");
        break;
      case "nav_designer":
        setLocation("/designer");
        break;
      case "open_crm":
        setLocation("~/dashboard/customers");
        break;
      case "open_timeline":
        setLocation("/timeline");
        break;
      case "switch_workspace":
        setLocation("/hub");
        break;
      default:
        break;
    }
  };

  return (
    <CommandDialog open={commandOpen} onOpenChange={(open) => !open && closeCommand()}>
      <CommandInput
        placeholder={t("workspacePlatform.commandCenter.placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{t("workspacePlatform.commandCenter.empty")}</CommandEmpty>
        {grouped.map((group, i) => (
          <div key={group.category}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={t(`workspacePlatform.commandCategories.${group.category}`)}>
              {group.items.map((cmd) => (
                <CommandItem key={cmd.id} onSelect={() => runCommand(cmd)}>
                  {cmd.category === "ai" ? (
                    <Sparkles className="me-2 size-4 text-primary" />
                  ) : (
                    <Zap className="me-2 size-4 text-muted-foreground" />
                  )}
                  <span>{t(`workspacePlatform.${cmd.labelKey}`)}</span>
                  {cmd.shortcut && (
                    <span className="ms-auto text-[10px] text-muted-foreground">{cmd.shortcut}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {t("workspacePlatform.commandCenter.hint")}
      </div>
    </CommandDialog>
  );
}
