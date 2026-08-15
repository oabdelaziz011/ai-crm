import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlatformFeatureEnabledLookup } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  DASHBOARD_ROUTE_REGISTRY,
  isDashboardRoutePermitted,
  type DashboardSectionId,
} from "@/config/dashboard-route-registry";
import { useAppShell } from "@/context/app-shell-context";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function CommandPaletteInner() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const platformFeatureEnabled = usePlatformFeatureEnabledLookup();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const { commandPaletteOpen, setCommandPaletteOpen, setCopilotOpen } = useAppShell();

  const navigate = useCallback(
    (nestedPath: string) => {
      setLocation(nestedPath);
      setCommandPaletteOpen(false);
    },
    [setLocation, setCommandPaletteOpen],
  );

  const pages = useMemo(() => {
    const items: { id: DashboardSectionId; label: string; path: string }[] = [];

    for (const route of DASHBOARD_ROUTE_REGISTRY) {
      if (!isDashboardRoutePermitted(route, isSuperAdmin, hasPermission, platformFeatureEnabled, commercialFeatureEnabled)) continue;
      items.push({ id: route.id, label: t(route.titleKey), path: route.nestedPath });
    }

    return items.sort((a, b) => a.label.localeCompare(b.label));
  }, [hasPermission, isSuperAdmin, platformFeatureEnabled, commercialFeatureEnabled, t]);

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder={t("appShell.commandPalette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("appShell.commandPalette.empty")}</CommandEmpty>
        <CommandGroup heading={t("appShell.commandPalette.actions")}>
          <CommandItem
            onSelect={() => {
              setCommandPaletteOpen(false);
              setCopilotOpen(true);
            }}
          >
            <Sparkles className="me-2 h-4 w-4" aria-hidden="true" />
            {t("appShell.commandPalette.askAi")}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("appShell.commandPalette.pages")}>
          <CommandItem onSelect={() => navigate("/")}>
            {t("navigation.home")}
          </CommandItem>
          {pages.map((page) => (
            <CommandItem key={page.id} onSelect={() => navigate(page.path)}>
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {t("appShell.commandPalette.hint", { shortcut: isMac ? "⌘⇧K" : "Ctrl+Shift+K" })}
      </div>
    </CommandDialog>
  );
}

const LazyCommandPalette = lazy(async () => ({ default: CommandPaletteInner }));

export function CommandPalette() {
  const { openCommandPalette, setCommandPaletteOpen } = useAppShell();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openCommandPalette, setCommandPaletteOpen]);

  return (
    <Suspense fallback={null}>
      <LazyCommandPalette />
    </Suspense>
  );
}

export function CommandPaletteTrigger() {
  const { t } = useTranslation("common");
  const { openCommandPalette } = useAppShell();

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="flex h-10 w-full max-w-md items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 text-sm text-muted-foreground shadow-inner transition-all duration-150 hover:border-primary/30 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:max-w-lg"
      aria-label={t("appShell.commandPalette.open")}
    >
      <span className="flex-1 text-start">{t("appShell.commandPalette.search")}</span>
      <span className="shell-kbd hidden sm:inline-flex">{isMac ? "⌘⇧K" : "Ctrl+Shift+K"}</span>
    </button>
  );
}

export function CommandPaletteMobileTrigger() {
  const { t } = useTranslation("common");
  const { openCommandPalette } = useAppShell();

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      aria-label={t("appShell.commandPalette.open")}
    >
      <Sparkles className="h-4 w-4 rotate-0" aria-hidden="true" />
    </button>
  );
}
