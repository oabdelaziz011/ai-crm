import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const KNOWLEDGE_BASE_NESTED_PATH = "/knowledge";

export type KnowledgeRouteId = "sources" | "documents" | "import" | "retrieval";

export type KnowledgeRouteDefinition = {
  id: KnowledgeRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
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

export const KNOWLEDGE_ROUTE_REGISTRY: readonly KnowledgeRouteDefinition[] = [
  {
    id: "sources",
    nestedPath: "/",
    titleKey: "knowledge.nav.sources",
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-sources-page"), "KnowledgeSourcesPage"),
  },
  {
    id: "documents",
    nestedPath: "/documents",
    titleKey: "knowledge.nav.documents",
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-documents-page"), "KnowledgeDocumentsPage"),
  },
  {
    id: "import",
    nestedPath: "/import",
    titleKey: "knowledge.nav.importStatus",
    permission: "knowledge.import",
    Page: lazyNamed(() => import("@/pages/dashboard/knowledge/knowledge-import-page"), "KnowledgeImportPage"),
  },
  {
    id: "retrieval",
    nestedPath: "/retrieval",
    titleKey: "knowledge.nav.retrievalTester",
    permission: "knowledge.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/knowledge/knowledge-retrieval-tester-page"),
      "KnowledgeRetrievalTesterPage",
    ),
  },
] as const;

export const KNOWLEDGE_DEFAULT_NESTED_PATH = "/";

export function knowledgeNavItems(): readonly KnowledgeRouteDefinition[] {
  return KNOWLEDGE_ROUTE_REGISTRY;
}
