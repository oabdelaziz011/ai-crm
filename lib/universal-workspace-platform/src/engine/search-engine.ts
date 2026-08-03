import type { GlobalSearchGroup, GlobalSearchResult } from "../types/search-types.js";
import { MOCK_SEARCH_INDEX } from "../mock/mock-search-index.js";

const GROUP_LABELS: Record<string, string> = {
  customer: "search.groups.customers",
  lead: "search.groups.leads",
  company: "search.groups.companies",
  employee: "search.groups.employees",
  invoice: "search.groups.invoices",
  payment: "search.groups.payments",
  booking: "search.groups.bookings",
  task: "search.groups.tasks",
  project: "search.groups.projects",
  ticket: "search.groups.tickets",
  asset: "search.groups.assets",
  file: "search.groups.files",
  email: "search.groups.emails",
  whatsapp: "search.groups.whatsapp",
  note: "search.groups.notes",
  command: "search.groups.commands",
  setting: "search.groups.settings",
};

export class SearchEngine {
  search(query: string, limit = 30): GlobalSearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_SEARCH_INDEX.slice(0, limit);
    return MOCK_SEARCH_INDEX.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        r.preview.toLowerCase().includes(q),
    )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  groupResults(results: GlobalSearchResult[]): GlobalSearchGroup[] {
    const map = new Map<string, GlobalSearchResult[]>();
    for (const r of results) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    return Array.from(map.entries()).map(([type, items]) => ({
      type: type as GlobalSearchResult["type"],
      labelKey: GROUP_LABELS[type] ?? type,
      results: items,
    }));
  }
}

export const searchEngine = new SearchEngine();
