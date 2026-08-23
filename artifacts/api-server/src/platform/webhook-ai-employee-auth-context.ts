/**
 * Phase 5E — Webhook AI Employee product authorization context.
 *
 * Separates:
 * - TECHNICAL service identity (SYSTEM_CONTEXT / service-role DB) — unchanged elsewhere
 * - PRODUCT authorization for AI Employee tool/runtime execution — never platform super-admin
 *
 * Real product gates remain:
 * assignment ∩ commercial entitlement (Phase 2) ∩ company isolation ∩ trustedCustomerId ownership.
 */

export type WebhookAiEmployeeAuthInput = {
  companyId: string | null | undefined;
  userId: string | null | undefined;
};

/**
 * Permission codes an AI Employee machine may present to ToolRouter / runtime RBAC interfaces.
 * Not a commercial entitlement grant — Phase 2 still gates features.
 */
export const WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST: ReadonlySet<string> = new Set([
  // Runtime / AI execution (coordinator + enterprise runtime asserts)
  "runtime.view",
  "runtime.execute",
  "runtime.manage",
  "ai.execution.view",
  "ai.execution.manage",
  // Conversation domain (inbound reply / state — MessageService + ConversationService)
  "ai.conversations.view",
  "ai.conversations.reply",
  // Intent matching (IntentEngineService on inbound AI path)
  "intents.view",
  // Prompt assembly (PromptOrchestrator / PromptRuntime)
  "prompts.view",
  "prompts.preview",
  // Provider selection for LLM calls
  "ai.providers.view",
  // Channel platform route/dispatch on product runtime surfaces
  "channel.platform.view",
  "channel.platform.route",
  "channel.platform.dispatch",
  // Knowledge retrieval (RAG path)
  "retrieval.view",
  "retrieval.execute",
  // Automation / workflow transfer when assigned
  "automation.view",
  "automation.execute",
  // Agent runtime (when employee uses agent coordinator)
  "agents.view",
  "agents.execute",
  // Tool router
  "tools.execute",
  "tools.view",
  // Customers
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.delete",
  // Bookings / availability
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "availability.search",
  // Tickets
  "tickets.view",
  "tickets.create",
  "tickets.edit",
  "tickets.close",
  "tickets.assign",
  "tickets.comment",
  // Knowledge / finance (CRM tools on webhook)
  "knowledge.view",
  "invoices.view",
  // Handoff / leads
  "handoff.view",
  "handoff.escalate",
  "handoff.queue",
  "handoff.return_to_ai",
  "handoff.transfer",
  "leads.view",
  "leads.create",
  "leads.edit",
  "leads.qualify",
  "leads.convert",
  "leads.assign",
  "leads.merge",
]);

/** Permissions that must never be granted via webhook AI Employee machine context. */
const PLATFORM_ADMIN_ONLY_PERMISSION_PREFIXES = ["platform.", "billing.admin", "companies.delete"] as const;

export function isWebhookAiEmployeeToolPermission(permissionCode: string): boolean {
  const code = permissionCode.trim();
  if (!code) return false;
  for (const prefix of PLATFORM_ADMIN_ONLY_PERMISSION_PREFIXES) {
    if (code.startsWith(prefix) || code === prefix) return false;
  }
  return WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST.has(code);
}

/**
 * Product ServiceContext for channel AI Employee execution.
 * isSuperAdmin is always false — ToolRouter/runtime must not skip product RBAC.
 */
export function createWebhookAiEmployeeServiceContext(input: WebhookAiEmployeeAuthInput): {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: false;
  hasPermission: (permissionCode: string) => boolean;
} {
  const companyId = typeof input.companyId === "string" ? input.companyId.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";

  return {
    userId: userId || null,
    companyId: companyId || null,
    isSuperAdmin: false,
    hasPermission(permissionCode: string): boolean {
      // Fail closed without trusted tenant + actor (ToolRouter assertTenantContext also requires these).
      if (!companyId || !userId) return false;
      return isWebhookAiEmployeeToolPermission(permissionCode);
    },
  };
}
