/**
 * Canonical AI Employee capability catalog.
 * Phase 1: wizard / UI availability filtering.
 * Phase 2: runtime commercial authorization (same feature → tool mapping).
 *
 * Reuses existing feature codes + TOOL_REGISTRY keys. Does not create a parallel registry.
 */

import { TICKET_TOOL_KEYS } from "@workspace/ai-tool-router";
import { LEAD_TOOL_KEYS } from "@workspace/ai-tool-router";

/** Existing billing feature codes that gate AI Employee tools (no new codes). */
export type AiEmployeeCapabilityFeatureCode =
  | "ai_employee"
  | "customers"
  | "bookings"
  | "ticketing"
  | "ai_ticketing"
  | "leads"
  | "finance"
  | "omnichannel"
  | "workflow_automation";

/**
 * Canonical feature → tool keys.
 * Tools without a safe mapping are intentionally omitted (never exposed by default).
 */
export const FEATURE_TOOL_KEYS: Readonly<Record<AiEmployeeCapabilityFeatureCode, readonly string[]>> = {
  ai_employee: ["knowledge_search"],
  customers: [
    "search_customer",
    "create_customer",
    "update_customer",
    "find_duplicate_customers",
    "merge_customers",
    "import_customers",
  ],
  bookings: [
    "search_availability",
    "find_next_available",
    "recommend_appointment",
    "create_booking",
    "search_bookings",
    "reschedule_booking",
    "cancel_booking",
    "check_in",
    "check_out",
    "booking_search",
  ],
  ticketing: [...TICKET_TOOL_KEYS],
  ai_ticketing: [...TICKET_TOOL_KEYS],
  leads: [...LEAD_TOOL_KEYS],
  finance: ["invoice_search"],
  omnichannel: ["escalate_to_human", "queue_handoff", "return_to_ai"],
  workflow_automation: ["transfer_to_workflow"],
};

/** Reserved for tools that remain stubbed on webhook. Phase 5H: check_in/check_out are real. */
export const WEBHOOK_STUB_TOOL_KEYS = [] as const;

/** Previously unwired capabilities go here. Phase 5G: lead tools are webhook-wired. */
export const WEBHOOK_UNWIRED_TOOL_KEYS = [] as const;

export type AiEmployeeCapabilityGroupId =
  | "customers"
  | "bookings"
  | "tickets"
  | "sales"
  | "finance"
  | "knowledge"
  | "handoff"
  | "automation";

const TOOL_CAPABILITY_GROUP: Readonly<Record<string, AiEmployeeCapabilityGroupId>> = {
  search_customer: "customers",
  create_customer: "customers",
  update_customer: "customers",
  find_duplicate_customers: "customers",
  merge_customers: "customers",
  import_customers: "customers",
  search_availability: "bookings",
  find_next_available: "bookings",
  recommend_appointment: "bookings",
  create_booking: "bookings",
  search_bookings: "bookings",
  reschedule_booking: "bookings",
  cancel_booking: "bookings",
  check_in: "bookings",
  check_out: "bookings",
  booking_search: "bookings",
  create_ticket: "tickets",
  update_ticket: "tickets",
  close_ticket: "tickets",
  assign_ticket: "tickets",
  add_ticket_comment: "tickets",
  change_ticket_priority: "tickets",
  change_ticket_status: "tickets",
  search_ticket: "tickets",
  create_lead: "sales",
  update_lead: "sales",
  qualify_lead: "sales",
  convert_lead: "sales",
  assign_lead: "sales",
  search_lead: "sales",
  merge_lead: "sales",
  score_lead: "sales",
  suggest_next_action: "sales",
  invoice_search: "finance",
  knowledge_search: "knowledge",
  escalate_to_human: "handoff",
  queue_handoff: "handoff",
  return_to_ai: "handoff",
  transfer_to_workflow: "automation",
};

export const CAPABILITY_GROUP_ORDER: readonly AiEmployeeCapabilityGroupId[] = [
  "customers",
  "bookings",
  "tickets",
  "sales",
  "finance",
  "knowledge",
  "handoff",
  "automation",
];

const INBOUND_CHANNEL_TAG_RE = /^channel:(whatsapp|messenger|instagram)$/i;

export function isWebhookFacingEmployee(tags: readonly string[]): boolean {
  return tags.some((tag) => INBOUND_CHANNEL_TAG_RE.test(tag.trim()));
}

export function resolveCapabilityGroup(toolKey: string): AiEmployeeCapabilityGroupId | null {
  return TOOL_CAPABILITY_GROUP[toolKey] ?? null;
}

const TICKET_TOOL_KEY_SET = new Set<string>(TICKET_TOOL_KEYS);

/**
 * Reverse lookup: tool → required commercial feature codes (fail-closed when null).
 * Always includes `ai_employee` when the tool is mapped.
 * Ticket tools require both `ticketing` and `ai_ticketing` (preserves existing dual gate).
 */
export function resolveRequiredFeatureCodesForTool(
  toolKey: string,
): readonly AiEmployeeCapabilityFeatureCode[] | null {
  const key = toolKey.trim();
  if (!key) return null;

  if (TICKET_TOOL_KEY_SET.has(key)) {
    return ["ai_employee", "ticketing", "ai_ticketing"];
  }

  const domainCodes: AiEmployeeCapabilityFeatureCode[] = [];
  let listedAnywhere = false;

  for (const [featureCode, tools] of Object.entries(FEATURE_TOOL_KEYS) as Array<
    [AiEmployeeCapabilityFeatureCode, readonly string[]]
  >) {
    if (featureCode === "ticketing" || featureCode === "ai_ticketing") continue;
    if (!tools.includes(key)) continue;
    listedAnywhere = true;
    if (featureCode !== "ai_employee") {
      domainCodes.push(featureCode);
    }
  }

  if (!listedAnywhere) return null;
  if (domainCodes.length === 0) return ["ai_employee"];
  return ["ai_employee", ...domainCodes];
}

/** True when the tool appears in the canonical Phase 1 feature → tool mapping. */
export function isToolMappedInCapabilityCatalog(toolKey: string): boolean {
  return resolveRequiredFeatureCodesForTool(toolKey) != null;
}

/** Soft template defaults (not a permission boundary). Intersect with available tools before apply. */
export const PROMPT_TEMPLATE_DEFAULT_TOOL_KEYS: Readonly<Record<string, readonly string[]>> = {
  support: ["search_customer", "search_ticket", "create_ticket", "knowledge_search", "add_ticket_comment"],
  sales: ["search_customer", "create_lead", "search_lead", "qualify_lead", "suggest_next_action"],
  receptionist: ["search_customer", "search_availability", "create_booking", "create_customer"],
  operations: ["search_customer", "search_availability", "create_booking", "search_ticket", "knowledge_search"],
};

export function intersectToolKeysWithAvailable(
  desiredKeys: readonly string[],
  availableKeys: readonly string[],
): string[] {
  const available = new Set(availableKeys);
  return desiredKeys.filter((key) => available.has(key));
}

function featureIsEnabled(
  enabledFeatureCodes: ReadonlySet<string>,
  code: AiEmployeeCapabilityFeatureCode,
): boolean {
  return enabledFeatureCodes.has(code);
}

/**
 * Tools unlocked by the company's commercial features.
 * Ticketing requires both `ticketing` and `ai_ticketing` (matches existing port gates).
 */
export function resolveEntitledToolKeys(enabledFeatureCodes: Iterable<string>): Set<string> {
  const enabled = enabledFeatureCodes instanceof Set
    ? enabledFeatureCodes
    : new Set([...enabledFeatureCodes].map((code) => code.trim()).filter(Boolean));

  const entitled = new Set<string>();

  if (!featureIsEnabled(enabled, "ai_employee")) {
    return entitled;
  }

  const addAll = (keys: readonly string[]) => {
    for (const key of keys) entitled.add(key);
  };

  if (featureIsEnabled(enabled, "customers")) addAll(FEATURE_TOOL_KEYS.customers);
  if (featureIsEnabled(enabled, "bookings")) addAll(FEATURE_TOOL_KEYS.bookings);
  if (featureIsEnabled(enabled, "leads")) addAll(FEATURE_TOOL_KEYS.leads);
  if (featureIsEnabled(enabled, "finance")) addAll(FEATURE_TOOL_KEYS.finance);
  if (featureIsEnabled(enabled, "omnichannel")) addAll(FEATURE_TOOL_KEYS.omnichannel);
  if (featureIsEnabled(enabled, "workflow_automation")) addAll(FEATURE_TOOL_KEYS.workflow_automation);
  if (featureIsEnabled(enabled, "ai_employee")) addAll(FEATURE_TOOL_KEYS.ai_employee);

  if (featureIsEnabled(enabled, "ticketing") && featureIsEnabled(enabled, "ai_ticketing")) {
    addAll(FEATURE_TOOL_KEYS.ticketing);
  }

  return entitled;
}

export type CatalogToolOption = {
  key: string;
  displayName: string;
  category: string;
  description?: string | null;
};

export type ResolveAvailableEmployeeToolsInput = {
  enabledFeatureCodes: Iterable<string>;
  catalogTools: readonly CatalogToolOption[];
  /** When true, hide webhook stubs + unwired lead tools. */
  webhookFacing: boolean;
};

export type AvailableEmployeeTool = CatalogToolOption & {
  capabilityGroup: AiEmployeeCapabilityGroupId;
};

/**
 * availableTools = entitledFeatures ∩ catalog ∩ surface-ready
 */
export function resolveAvailableEmployeeTools(
  input: ResolveAvailableEmployeeToolsInput,
): AvailableEmployeeTool[] {
  const entitled = resolveEntitledToolKeys(input.enabledFeatureCodes);
  const surfaceBlocked = new Set<string>(
    input.webhookFacing
      ? [...WEBHOOK_STUB_TOOL_KEYS, ...WEBHOOK_UNWIRED_TOOL_KEYS]
      : [],
  );

  const result: AvailableEmployeeTool[] = [];
  for (const tool of input.catalogTools) {
    const key = tool.key.trim();
    if (!key) continue;
    if (!entitled.has(key)) continue;
    if (surfaceBlocked.has(key)) continue;
    const capabilityGroup = resolveCapabilityGroup(key);
    if (!capabilityGroup) continue;
    result.push({
      key,
      displayName: tool.displayName,
      category: tool.category,
      description: tool.description ?? null,
      capabilityGroup,
    });
  }

  return result.sort((a, b) => {
    const gi = CAPABILITY_GROUP_ORDER.indexOf(a.capabilityGroup);
    const gj = CAPABILITY_GROUP_ORDER.indexOf(b.capabilityGroup);
    if (gi !== gj) return gi - gj;
    return a.key.localeCompare(b.key);
  });
}

export function groupAvailableToolsByCapability(
  tools: readonly AvailableEmployeeTool[],
): Array<{ group: AiEmployeeCapabilityGroupId; tools: AvailableEmployeeTool[] }> {
  const map = new Map<AiEmployeeCapabilityGroupId, AvailableEmployeeTool[]>();
  for (const tool of tools) {
    const list = map.get(tool.capabilityGroup) ?? [];
    list.push(tool);
    map.set(tool.capabilityGroup, list);
  }
  return CAPABILITY_GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
    group,
    tools: map.get(group)!,
  }));
}

export function splitAssignedToolKeys(
  allowedToolKeys: readonly string[],
  availableToolKeys: readonly string[],
): { availableSelected: string[]; unavailableAssigned: string[] } {
  const available = new Set(availableToolKeys);
  const availableSelected: string[] = [];
  const unavailableAssigned: string[] = [];
  for (const key of allowedToolKeys) {
    if (available.has(key)) availableSelected.push(key);
    else unavailableAssigned.push(key);
  }
  return { availableSelected, unavailableAssigned };
}

export function selectAllAvailableToolKeys(
  allowedToolKeys: readonly string[],
  availableToolKeys: readonly string[],
): string[] {
  const { unavailableAssigned } = splitAssignedToolKeys(allowedToolKeys, availableToolKeys);
  return [...new Set([...unavailableAssigned, ...availableToolKeys])];
}

/** Clears currently available selections; preserves historically assigned unavailable keys. */
export function clearAvailableToolKeys(
  allowedToolKeys: readonly string[],
  availableToolKeys: readonly string[],
): string[] {
  const { unavailableAssigned } = splitAssignedToolKeys(allowedToolKeys, availableToolKeys);
  return [...unavailableAssigned];
}

export function toggleAvailableToolKey(
  allowedToolKeys: readonly string[],
  availableToolKeys: readonly string[],
  toolKey: string,
  enabled: boolean,
): string[] {
  const available = new Set(availableToolKeys);
  if (!available.has(toolKey)) {
    return [...allowedToolKeys];
  }
  const { unavailableAssigned, availableSelected } = splitAssignedToolKeys(
    allowedToolKeys,
    availableToolKeys,
  );
  const nextAvailable = enabled
    ? [...new Set([...availableSelected, toolKey])]
    : availableSelected.filter((key) => key !== toolKey);
  return [...unavailableAssigned, ...nextAvailable];
}
