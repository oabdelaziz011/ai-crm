import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import { mapAiEmployeeRow } from "@/lib/ai-employees/selectors";
// resolveInboundChannelEmployee is loaded dynamically on the production path so pure
// unit tests can inject resolveInbound without pulling browser Supabase env.

export type AiEmployeeDeleteDependencyType =
  | "employee_active"
  | "channel_inbound"
  | "channel_tags"
  | "workflow_active"
  | "transferable_flow"
  | "conversation_open"
  | "session_active"
  | "handoff_open";

/** @deprecated Use AiEmployeeDeleteDependencyType */
export type AiEmployeeArchiveDependencyType = AiEmployeeDeleteDependencyType;

export type AiEmployeeDeleteDependencyItem = {
  type: AiEmployeeDeleteDependencyType;
  id: string;
  name?: string;
  reason: string;
  severity: "block" | "warn";
};

/** @deprecated Use AiEmployeeDeleteDependencyItem */
export type AiEmployeeArchiveDependencyItem = AiEmployeeDeleteDependencyItem;

export type AiEmployeeDeleteDependencyResult = {
  canDelete: boolean;
  blockers: AiEmployeeDeleteDependencyItem[];
  warnings: AiEmployeeDeleteDependencyItem[];
  /** True when delete is blocked because lifecycle status is published (active). */
  isActiveEmployee?: boolean;
  /** True when the employee lifecycle is already archived (use Restore, not Delete). */
  alreadyArchived?: boolean;
  /** Effective inbound channel display names (active employees only). */
  effectiveChannelNames?: string[];
};

/** Published employees are "active" and must be disabled before deletion. */
export function isActiveAiEmployeeStatus(status: string | null | undefined): boolean {
  return status === "published";
}

/** Archived lifecycle — already soft-deleted or awaiting restore; not re-deletable. */
export function isArchivedAiEmployeeStatus(status: string | null | undefined): boolean {
  return status === "archived";
}

/** @deprecated Use AiEmployeeDeleteDependencyResult — maps canArchive ↔ canDelete */
export type AiEmployeeArchiveDependencyResult = {
  canArchive: boolean;
  blockers: AiEmployeeDeleteDependencyItem[];
  warnings: AiEmployeeDeleteDependencyItem[];
};

export const ACTIVE_AGENT_WORKFLOW_STATUSES = [
  "running",
  "waiting_user",
  "planning",
  "paused",
] as const;

export const TERMINAL_CONVERSATION_STATES = new Set([
  "closed",
  "completed",
  "cancelled",
]);

export const TERMINAL_HANDOFF_LIFECYCLE_STATES = new Set(["CLOSED", "RESOLVED"]);

const MESSAGING_CHANNEL_KEYS = new Set(["whatsapp", "messenger", "instagram"]);

/** Pure: conversation backend state is historical (does not block delete). */
export function isTerminalConversationState(state: string | null | undefined): boolean {
  if (!state) return false;
  return TERMINAL_CONVERSATION_STATES.has(state);
}

/** Pure: handoff ownership is closed/resolved (does not block delete). */
export function isTerminalHandoffLifecycleState(state: string | null | undefined): boolean {
  if (!state) return false;
  return TERMINAL_HANDOFF_LIFECYCLE_STATES.has(state);
}

/** Pure: tag score used by inbound routing (must stay aligned with resolve-inbound). */
export function scoreEmployeeTagsForChannel(
  tags: string[] | null | undefined,
  channelKey: string,
  companyChannelId: string,
): number {
  const list = tags ?? [];
  let score = 0;
  if (list.includes(`channel:${companyChannelId}`)) score += 100;
  if (list.includes(`channel:${channelKey}`)) score += 50;
  if (list.includes("capability:omnichannel")) score += 10;
  return score;
}

export function employeeHasChannelRoutingTags(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some(
    (tag) => tag.startsWith("channel:") || tag === "capability:omnichannel",
  );
}

export function readTransferableFlowId(
  runtimeConfiguration: AiEmployeeRecord["runtimeConfiguration"] | null | undefined,
): string | null {
  const value = runtimeConfiguration?.transferableFlowId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readAiEmployeeIdFromWorkflowMemory(
  memory: unknown,
): string | null {
  if (!memory || typeof memory !== "object") return null;
  const executionState = (memory as { executionState?: unknown }).executionState;
  if (!executionState || typeof executionState !== "object") return null;
  const pageContext = (executionState as { pageContext?: unknown }).pageContext;
  if (!pageContext || typeof pageContext !== "object") return null;
  const aiEmployeeId = (pageContext as { aiEmployeeId?: unknown }).aiEmployeeId;
  return typeof aiEmployeeId === "string" && aiEmployeeId.length > 0 ? aiEmployeeId : null;
}

export function emptyDeleteDependencyResult(): AiEmployeeDeleteDependencyResult {
  return { canDelete: true, blockers: [], warnings: [] };
}

/** @deprecated Use emptyDeleteDependencyResult */
export function emptyArchiveDependencyResult(): AiEmployeeArchiveDependencyResult {
  const empty = emptyDeleteDependencyResult();
  return { canArchive: empty.canDelete, blockers: empty.blockers, warnings: empty.warnings };
}

function finalize(
  blockers: AiEmployeeDeleteDependencyItem[],
  warnings: AiEmployeeDeleteDependencyItem[],
): AiEmployeeDeleteDependencyResult {
  return {
    canDelete: blockers.length === 0,
    blockers,
    warnings,
  };
}

async function isAutomationPreemptingAi(
  client: SupabaseClient,
  companyId: string,
  companyChannelId: string,
): Promise<boolean> {
  const { data: binding, error: bindingError } = await client
    .from("company_channel_automation_bindings")
    .select("automation_flow_id, is_enabled")
    .eq("company_channel_id", companyChannelId)
    .is("deleted_at", null)
    .maybeSingle();

  if (bindingError) throw new Error(bindingError.message);
  if (!binding?.is_enabled || !binding.automation_flow_id) return false;

  const { data: flow, error: flowError } = await client
    .from("automation_flows")
    .select("id, company_id, status")
    .eq("id", binding.automation_flow_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (flowError) throw new Error(flowError.message);
  if (!flow || flow.company_id !== companyId) return false;
  return flow.status === "active";
}

type CompanyMessagingChannel = {
  id: string;
  displayName: string;
  channelKey: string;
};

async function listEnabledMessagingChannels(
  client: SupabaseClient,
  companyId: string,
): Promise<CompanyMessagingChannel[]> {
  const { data, error } = await client
    .from("company_channels")
    .select("id, display_name, is_enabled, deleted_at, communication_channels(key)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .eq("is_enabled", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    display_name: string;
    communication_channels?: { key?: string } | { key?: string }[] | null;
  }>;

  return rows
    .map((row) => {
      const embedded = row.communication_channels;
      const key = Array.isArray(embedded)
        ? embedded[0]?.key
        : embedded?.key;
      return {
        id: row.id,
        displayName: row.display_name,
        channelKey: typeof key === "string" ? key : "",
      };
    })
    .filter((row) => MESSAGING_CHANNEL_KEYS.has(row.channelKey));
}

export type ResolveInboundChannelEmployeeFn = (
  client: SupabaseClient,
  companyId: string,
  channelKey: string,
  companyChannelId: string,
) => Promise<AiEmployeeRecord | null>;

export type AssertAiEmployeeSafeToDeleteOptions = {
  /**
   * Optional seam for unit tests. Production callers must omit this so the real
   * inbound resolver (published + ready runtime + tag scoring) is used.
   */
  resolveInbound?: ResolveInboundChannelEmployeeFn;
};

/** @deprecated Use AssertAiEmployeeSafeToDeleteOptions */
export type AssertAiEmployeeSafeToArchiveOptions = AssertAiEmployeeSafeToDeleteOptions;

/**
 * Server-side delete safety check. Tenant-scoped via companyId + user-scoped client RLS.
 *
 * Lifecycle rule (approved):
 * - published (ACTIVE) → block; explain disable-first + effective channels only
 * - draft / disabled / archived / other non-active → allow (no dependency matrix)
 *
 * Does not mutate any data. Does not auto-unlink dependencies.
 */
export async function assertAiEmployeeSafeToDelete(
  client: SupabaseClient,
  companyId: string,
  employeeId: string,
  options?: AssertAiEmployeeSafeToDeleteOptions,
): Promise<AiEmployeeDeleteDependencyResult> {
  const resolveInbound: ResolveInboundChannelEmployeeFn =
    options?.resolveInbound ??
    (async (clientArg, companyIdArg, channelKey, companyChannelId) => {
      const { resolveInboundChannelEmployee } = await import("./resolve-inbound-channel-employee");
      return resolveInboundChannelEmployee(clientArg, companyIdArg, channelKey, companyChannelId);
    });

  const { data: row, error } = await client
    .from("ai_employees")
    .select("*")
    .eq("id", employeeId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) {
    return finalize(
      [
        {
          type: "employee_active",
          id: employeeId,
          reason: "AI Employee not found in this company.",
          severity: "block",
        },
      ],
      [],
    );
  }

  const employee = mapAiEmployeeRow(row as never);

  if (isArchivedAiEmployeeStatus(employee.status)) {
    return {
      canDelete: false,
      blockers: [
        {
          type: "employee_active",
          id: employeeId,
          name: employee.displayName,
          reason: "employee_archived",
          severity: "block",
        },
      ],
      warnings: [],
      alreadyArchived: true,
    };
  }

  // Non-active lifecycle states: allow soft-delete regardless of soft references.
  if (!isActiveAiEmployeeStatus(employee.status)) {
    return emptyDeleteDependencyResult();
  }

  // --- ACTIVE (published): block; collect effective inbound channels for UX only ---
  const channels = await listEnabledMessagingChannels(client, companyId);
  const effectiveChannelNames: string[] = [];
  const channelBlockers: AiEmployeeDeleteDependencyItem[] = [];

  for (const channel of channels) {
    const preempted = await isAutomationPreemptingAi(client, companyId, channel.id);
    if (preempted) continue;

    const resolved = await resolveInbound(client, companyId, channel.channelKey, channel.id);
    if (resolved?.id !== employeeId) continue;

    const displayName = channel.displayName || channel.channelKey;
    effectiveChannelNames.push(displayName);
    channelBlockers.push({
      type: "channel_inbound",
      id: channel.id,
      name: displayName,
      reason: displayName,
      severity: "block",
    });
  }

  const blockers: AiEmployeeDeleteDependencyItem[] = [
    {
      type: "employee_active",
      id: employeeId,
      name: employee.displayName,
      reason: "employee_active",
      severity: "block",
    },
    ...channelBlockers,
  ];

  return {
    canDelete: false,
    blockers,
    warnings: [],
    isActiveEmployee: true,
    effectiveChannelNames,
  };
}

/** @deprecated Use assertAiEmployeeSafeToDelete */
export async function assertAiEmployeeSafeToArchive(
  client: SupabaseClient,
  companyId: string,
  employeeId: string,
  options?: AssertAiEmployeeSafeToDeleteOptions,
): Promise<AiEmployeeArchiveDependencyResult> {
  const result = await assertAiEmployeeSafeToDelete(client, companyId, employeeId, options);
  return {
    canArchive: result.canDelete,
    blockers: result.blockers,
    warnings: result.warnings,
  };
}
