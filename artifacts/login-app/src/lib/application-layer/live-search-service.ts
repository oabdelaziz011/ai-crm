import type { GlobalSearchGroup, GlobalSearchResult } from "@workspace/universal-workspace-platform";
import type { LoginAppPortContext } from "./create-login-app-application-ports.js";
import { createLoginAppGlobalSearchReadPort } from "./adapters/global-search-read-port-adapter.js";
import { supabase } from "@/lib/supabase";

const GROUP_LABELS: Record<string, string> = {
  customer: "search.groups.customers",
  lead: "search.groups.leads",
  company: "search.groups.companies",
};

const GROUP_ICONS: Record<string, string> = {
  customer: "User",
  lead: "Target",
  company: "Building2",
};

export async function searchLiveCrmAsync(
  ctx: LoginAppPortContext,
  query: string,
  limit = 30,
): Promise<{ results: GlobalSearchResult[]; groups: GlobalSearchGroup[] }> {
  const port = createLoginAppGlobalSearchReadPort(supabase, ctx);
  const q = query.trim();
  if (!q) return { results: [], groups: [] };

  const models = await port.search(ctx.companyId, q, limit);
  const results: GlobalSearchResult[] = models.map((model) => ({
    id: model.id,
    type: model.type as GlobalSearchResult["type"],
    title: model.title,
    subtitle: model.subtitle,
    preview: model.preview,
    icon: GROUP_ICONS[model.type] ?? "Search",
    score: model.score,
  }));

  const map = new Map<string, GlobalSearchResult[]>();
  for (const result of results) {
    const list = map.get(result.type) ?? [];
    list.push(result);
    map.set(result.type, list);
  }

  const groups: GlobalSearchGroup[] = Array.from(map.entries()).map(([type, items]) => ({
    type: type as GlobalSearchResult["type"],
    labelKey: GROUP_LABELS[type] ?? type,
    results: items,
  }));

  return { results, groups };
}
