import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const PROMPT_BASE_NESTED_PATH = "/prompts";

export type PromptRouteId = "library" | "editor";

export type PromptRouteDefinition = {
  id: PromptRouteId;
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

export const PROMPT_ROUTE_REGISTRY: readonly PromptRouteDefinition[] = [
  {
    id: "library",
    nestedPath: "/",
    titleKey: "prompts.nav.library",
    Page: lazyNamed(() => import("@/pages/dashboard/prompts/prompt-library-page"), "PromptLibraryPage"),
  },
  {
    id: "editor",
    nestedPath: "/editor/:templateId",
    titleKey: "prompts.nav.editor",
    permission: "prompts.manage",
    Page: lazyNamed(() => import("@/pages/dashboard/prompts/prompt-editor-page"), "PromptEditorPage"),
  },
] as const;

export const PROMPT_DEFAULT_NESTED_PATH = "/";

export function promptNavItems(): readonly PromptRouteDefinition[] {
  return PROMPT_ROUTE_REGISTRY.filter((route) => route.id !== "editor");
}
