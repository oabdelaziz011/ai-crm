/**
 * Phase 1 — Build Guide systemPrompt + enriched pageContext (read-only, no tools).
 */
import type { GuideEffectiveAuth } from "./guide-auth";
import { buildGuidePermissionSnapshot, evaluateGuideTaskAccess } from "./guide-auth";
import { listGuideTaskIds, type GuideTaskId } from "./permission-matrix";
import { listGuideModules, resolveGuideModuleForRoute } from "./product-knowledge";
import { GUIDE_WORKFLOWS } from "./guide-workflows";
import { GUIDE_ACTION_FENCE_END, GUIDE_ACTION_FENCE_START } from "./guide-actions";

export type GuideLanguage = "ar" | "en" | "de";

export type GuidePageContextInput = {
  route?: string | null;
  page?: string | null;
  moduleLabel?: string | null;
  pageTitle?: string | null;
  activeTab?: string | null;
  companyId?: string | null;
  userId?: string | null;
  language: GuideLanguage;
};

export type BuildGuidePromptInput = {
  auth: GuideEffectiveAuth;
  page: GuidePageContextInput;
  /** Optional translator; falls back to keys when omitted (tests). */
  t?: (key: string) => string;
};

function translate(t: ((key: string) => string) | undefined, key: string): string {
  if (!t) return key;
  try {
    const value = t(key);
    return value && value !== key ? value : key;
  } catch {
    return key;
  }
}

function languageLabel(lang: GuideLanguage): string {
  if (lang === "ar") return "Arabic";
  if (lang === "de") return "German";
  return "English";
}

export function buildGuideSystemPrompt(input: BuildGuidePromptInput): string {
  const snapshot = buildGuidePermissionSnapshot(input.auth);
  const t = input.t;
  const modules = listGuideModules()
    .map((mod) => {
      const name = translate(t, mod.nameKey);
      const description = translate(t, mod.descriptionKey);
      const pages = mod.pages
        .map((p) => `- ${p.routeId} (${p.nestedPath}) titleKey=${p.titleKey} permission=${p.routePermission ?? "none"}`)
        .join("\n");
      const tasks = mod.tasks.join(", ");
      return `### ${mod.id} — ${name}\n${description}\nPages:\n${pages || "- (home / no nested page)"}\nTasks: ${tasks}`;
    })
    .join("\n\n");

  const taskAccess = listGuideTaskIds()
    .map((taskId) => {
      const decision = evaluateGuideTaskAccess(input.auth, taskId);
      if (decision.allowed) return `${taskId}: ALLOWED`;
      return `${taskId}: DENIED (${decision.reason}; missing=${decision.missing.join("|") || "n/a"})`;
    })
    .join("\n");

  const workflows = GUIDE_WORKFLOWS.map(
    (w) =>
      `- ${w.id} (requires ${w.requiredTask}): ${w.steps.map((s) => s.id).join(" → ")}`,
  ).join("\n");

  const currentModule = resolveGuideModuleForRoute(input.page.page ?? null);

  return [
    "You are ValueOR AI Guide — an in-app product guide for the ValueOR platform.",
    "You are NOT Assist. You cannot execute business operations, tools, CRM writes, sends, publishes, or knowledge_search.",
    "You only explain features, check permissions, guide step-by-step, and request navigation.",
    "",
    `Respond in ${languageLabel(input.page.language)} only. Match RTL/LTR expectations for that language.`,
    "",
    "## Hard rules",
    "1. Never claim the user can perform an action they lack permission for.",
    "2. Never invent routes, modules, or features not listed below.",
    "3. Never submit forms or create/update/delete records yourself.",
    "4. If permissionsAvailable is false, refuse restricted navigation and sensitive module details (fail closed).",
    "5. When opening a page, emit exactly one navigation action fence (see protocol). Do not invent URLs.",
    "6. Prefer interactive steps: explain one step, wait for the user to confirm, then continue.",
    "7. Cross-company data is forbidden. Stay within the current company context.",
    "",
    "## Navigation action protocol",
    `To open an authorized page, append:`,
    GUIDE_ACTION_FENCE_START,
    '{"type":"navigate","routeId":"<registry-route-id>"}',
    GUIDE_ACTION_FENCE_END,
    "Only use routeIds from permittedRouteIds. If unauthorized, explain the missing permission and that an admin can grant it via Roles.",
    "",
    "## Current page context",
    `- route: ${input.page.route ?? "unknown"}`,
    `- page/module id: ${input.page.page ?? "unknown"}`,
    `- moduleLabel: ${input.page.moduleLabel ?? ""}`,
    `- pageTitle: ${input.page.pageTitle ?? ""}`,
    `- activeTab: ${input.page.activeTab ?? ""}`,
    `- companyId: ${snapshot.companyId ?? "null"}`,
    `- userId: ${snapshot.userId ?? "null"}`,
    `- resolvedGuideModule: ${currentModule?.id ?? "none"}`,
    `- language: ${input.page.language}`,
    "",
    "## Effective permissions (authoritative for this turn)",
    `- permissionsAvailable: ${snapshot.permissionsAvailable}`,
    `- isSuperAdmin: ${snapshot.isSuperAdmin}`,
    `- isRefreshing: ${snapshot.isRefreshing}`,
    `- permittedRouteIds: ${snapshot.permittedRouteIds.join(", ") || "(none)"}`,
    `- permissionCodes: ${snapshot.permissionCodes.join(", ") || "(none)"}`,
    `- capturedAt: ${snapshot.capturedAt}`,
    "",
    "## Task access matrix (this turn)",
    taskAccess,
    "",
    "## Product modules (existing ValueOR only)",
    modules,
    "",
    "## Known interactive workflows",
    workflows,
  ].join("\n");
}

export function enrichGuidePageContext(input: {
  base: Record<string, unknown>;
  auth: GuideEffectiveAuth;
  language: GuideLanguage;
  activeTab?: string | null;
  t?: (key: string) => string;
}): Record<string, unknown> {
  const page: GuidePageContextInput = {
    route: typeof input.base.route === "string" ? input.base.route : null,
    page: typeof input.base.module === "string"
      ? input.base.module
      : typeof input.base.page === "string"
        ? input.base.page
        : null,
    moduleLabel: typeof input.base.moduleLabel === "string" ? input.base.moduleLabel : null,
    pageTitle: typeof input.base.pageTitle === "string" ? input.base.pageTitle : null,
    activeTab: input.activeTab ?? (typeof input.base.activeTab === "string" ? input.base.activeTab : null),
    companyId:
      typeof (input.base.company as { id?: string } | undefined)?.id === "string"
        ? (input.base.company as { id: string }).id
        : input.auth.companyId,
    userId:
      typeof (input.base.user as { id?: string } | undefined)?.id === "string"
        ? (input.base.user as { id: string }).id
        : input.auth.userId,
    language: input.language,
  };

  const snapshot = buildGuidePermissionSnapshot(input.auth);
  const systemPrompt = buildGuideSystemPrompt({
    auth: input.auth,
    page,
    t: input.t,
  });

  return {
    ...input.base,
    guideMode: true,
    assistantSurface: "guide",
    activeTab: page.activeTab,
    language: input.language,
    guidePermissionSnapshot: snapshot,
    systemPrompt,
  };
}

export function summarizeDeniedCreateGuidance(taskId: GuideTaskId, missing: readonly string[]): {
  taskId: GuideTaskId;
  missing: readonly string[];
  suggestAdmin: boolean;
} {
  return {
    taskId,
    missing,
    suggestAdmin: missing.length > 0,
  };
}
