import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const KNOWLEDGE_BASE_NESTED_PATH = "/knowledge";

export type KnowledgeRouteId = "sources" | "create" | "documents" | "import" | "retrieval";

export type KnowledgeRouteDefinition = {
  id: KnowledgeRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  /** Hide from knowledge sub-nav — advanced routes stay reachable via deep links. */
  navHidden?: boolean;
  Page: LazyExoticComponent<ComponentType>;
};

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

/**
 * Product model (BA):
 * - Library (`/`) = inventory of knowledge sources
 * - Wizard (`/new`) = the only guided path (source → import → documents → verify)
 * - documents / import / retrieval remain as advanced deep-links, not primary tabs
 */
export const KNOWLEDGE_ROUTE_REGISTRY: readonly KnowledgeRouteDefinition[] = [
  {
    id: "create",
    nestedPath: "/new",
    titleKey: "knowledge.nav.create",
    permission: "knowledge.manage",
    navHidden: true,
    Page: lazyNamed(
      () => import("@/pages/dashboard/knowledge/knowledge-create-wizard-page"),
      "KnowledgeCreateWizardPage",
    ),
  },
  {
    id: "documents",
    nestedPath: "/documents",
    titleKey: "knowledge.nav.documents",
    navHidden: true,
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-documents-page"), "KnowledgeDocumentsPage"),
  },
  {
    id: "import",
    nestedPath: "/import",
    titleKey: "knowledge.nav.import",
    permission: "knowledge.import",
    navHidden: true,
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-import-page"), "KnowledgeImportPage"),
  },
  {
    id: "retrieval",
    nestedPath: "/retrieval",
    titleKey: "knowledge.nav.retrievalTester",
    permission: "knowledge.view",
    navHidden: true,
    Page: lazyNamed(
      () => import("@/pages/dashboard/knowledge/knowledge-retrieval-tester-page"),
      "KnowledgeRetrievalTesterPage",
    ),
  },
  {
    id: "sources",
    nestedPath: "/",
    titleKey: "knowledge.nav.library",
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-sources-page"), "KnowledgeSourcesPage"),
  },
] as const;

export const KNOWLEDGE_DEFAULT_NESTED_PATH = "/";

export function knowledgeNavItems(): readonly KnowledgeRouteDefinition[] {
  return KNOWLEDGE_ROUTE_REGISTRY.filter((route) => !route.navHidden);
}

export function knowledgeCreateHref(sourceId?: string): string {
  if (sourceId) return `/new?source=${encodeURIComponent(sourceId)}`;
  return "/new";
}
