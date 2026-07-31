import type { ConfirmationPolicy, ConfirmationRiskLevel, ToolConfirmationDeclaration } from "./confirmation-types.js";

const POLICY_REQUIRES_CONFIRMATION = new Set<ConfirmationPolicy>([
  "destructive",
  "external",
  "financial",
  "bulk",
  "always",
]);

export const TOOL_CONFIRMATION_POLICIES: Record<string, ToolConfirmationDeclaration> = {
  // Read-only — never confirm
  search_customer: { toolKey: "search_customer", policy: "never" },
  find_duplicate_customers: { toolKey: "find_duplicate_customers", policy: "never" },
  knowledge_search: { toolKey: "knowledge_search", policy: "never" },
  invoice_search: { toolKey: "invoice_search", policy: "never" },
  booking_search: { toolKey: "booking_search", policy: "never" },
  search_availability: { toolKey: "search_availability", policy: "never" },
  find_next_available: { toolKey: "find_next_available", policy: "never" },
  recommend_appointment: { toolKey: "recommend_appointment", policy: "never" },

  // Standard writes
  create_customer: { toolKey: "create_customer", policy: "never" },
  update_customer: { toolKey: "update_customer", policy: "never" },

  // Destructive / irreversible CRM
  merge_customers: {
    toolKey: "merge_customers",
    policy: "destructive",
    irreversible: true,
    defaultRiskLevel: "critical",
    actionLabel: "Merge customer records",
  },
  import_customers: {
    toolKey: "import_customers",
    policy: "bulk",
    irreversible: false,
    defaultRiskLevel: "high",
    actionLabel: "Bulk import customers",
  },

  // Externally visible actions
  create_booking: {
    toolKey: "create_booking",
    policy: "external",
    irreversible: false,
    defaultRiskLevel: "medium",
    actionLabel: "Create booking",
  },
  notification: {
    toolKey: "notification",
    policy: "external",
    irreversible: false,
    defaultRiskLevel: "medium",
    actionLabel: "Send notification",
  },

  // Financial (reserved for billing agent tools)
  refund_payment: {
    toolKey: "refund_payment",
    policy: "financial",
    irreversible: true,
    defaultRiskLevel: "critical",
    actionLabel: "Issue refund",
  },

  // High-risk control plane
  escalation: {
    toolKey: "escalation",
    policy: "always",
    irreversible: false,
    defaultRiskLevel: "high",
    actionLabel: "Escalate conversation",
  },
};

const DEFAULT_DECLARATION: ToolConfirmationDeclaration = {
  toolKey: "*",
  policy: "never",
};

export function resolveToolConfirmationPolicy(toolKey: string): ToolConfirmationDeclaration {
  return TOOL_CONFIRMATION_POLICIES[toolKey] ?? { ...DEFAULT_DECLARATION, toolKey };
}

export function requiresConfirmationPolicy(policy: ConfirmationPolicy): boolean {
  return POLICY_REQUIRES_CONFIRMATION.has(policy);
}

export function requiresConfirmationForTool(
  toolKey: string,
  toolInput?: Record<string, unknown>,
): boolean {
  const declaration = resolveToolConfirmationPolicy(toolKey);
  if (!requiresConfirmationPolicy(declaration.policy)) {
    return false;
  }

  if (declaration.policy === "bulk" && toolInput) {
    const rows = toolInput.rows ?? toolInput.customers ?? toolInput.records;
    if (Array.isArray(rows) && rows.length <= 1) {
      return false;
    }
  }

  return true;
}

export function resolveRiskLevel(declaration: ToolConfirmationDeclaration): ConfirmationRiskLevel {
  if (declaration.defaultRiskLevel) return declaration.defaultRiskLevel;
  switch (declaration.policy) {
    case "destructive":
    case "financial":
      return "critical";
    case "bulk":
      return "high";
    case "external":
      return "medium";
    case "always":
      return "high";
    default:
      return "low";
  }
}
