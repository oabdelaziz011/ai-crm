import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { GlobalSearchResult } from "@workspace/universal-workspace-platform";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { searchLiveCrmAsync } from "@/lib/application-layer/live-search-service";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceGlobalSearch() {
  const { t } = useTranslation("common");
  const { searchOpen, closeSearch, search, selectedSearchResult, setSelectedSearchResult } = useWorkspacePlatform();
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const [query, setQuery] = useState("");

  const liveSearchQuery = useQuery({
    queryKey: ["workspace-live-search", company?.id, query],
    enabled: Boolean(searchOpen && company?.id && user?.id && query.trim()),
    queryFn: () =>
      searchLiveCrmAsync(
        {
          companyId: company!.id,
          actorUserId: user!.id,
          isSuperAdmin,
          hasPermission,
        },
        query,
      ),
    staleTime: 30_000,
  });

  const mockResults = useMemo(() => search(query), [search, query]);

  const groups = company?.id && query.trim() ? (liveSearchQuery.data?.groups ?? []) : mockResults.groups;

  const preview = selectedSearchResult;

  return (
    <CommandDialog open={searchOpen} onOpenChange={(open) => !open && closeSearch()}>
      <CommandInput
        placeholder={t("workspacePlatform.globalSearch.placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <div className="flex max-h-[420px]">
        <CommandList className="max-h-[420px] flex-1">
          <CommandEmpty>{t("workspacePlatform.globalSearch.empty")}</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.type} heading={t(`workspacePlatform.${group.labelKey}`)}>
              {group.results.map((result) => (
                <CommandItem
                  key={result.id}
                  onSelect={() => setSelectedSearchResult(result)}
                  className={cn(selectedSearchResult?.id === result.id && "bg-accent")}
                >
                  <Search className="me-2 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{result.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        {preview && (
          <div className="hidden w-64 shrink-0 border-s border-border/60 p-4 sm:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("workspacePlatform.globalSearch.preview")}
            </p>
            <p className="mt-2 text-sm font-semibold">{preview.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{preview.subtitle}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{preview.preview}</p>
          </div>
        )}
      </div>
    </CommandDialog>
  );
}
