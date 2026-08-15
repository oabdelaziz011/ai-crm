import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveAutomationFlowOption,
  ChannelWorkflowBindingListItem,
  ChannelWorkflowBindingRecord,
  SaveChannelWorkflowBindingInput,
  SaveChannelWorkflowBindingResult,
} from "./types";

const BINDINGS_TABLE = "company_channel_automation_bindings";
const FLOWS_TABLE = "automation_flows";
const SESSIONS_TABLE = "conversation_sessions";
const RUNS_TABLE = "automation_runs";

function mapBinding(row: Record<string, unknown>): ChannelWorkflowBindingRecord {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    companyChannelId: row.company_channel_id as string,
    automationFlowId: row.automation_flow_id as string,
    isEnabled: Boolean(row.is_enabled),
  };
}

/** Stop in-flight WhatsApp automation so disabled bindings cannot resume waiting steps. */
export async function cancelActiveAutomationSessionsForFlow(
  client: SupabaseClient,
  input: { companyId: string; automationFlowId: string },
): Promise<{ sessionCount: number; runCount: number }> {
  const now = new Date().toISOString();
  const activeStatuses = ["active", "running", "waiting_input", "paused"];

  const { data: sessions, error: sessionsError } = await client
    .from(SESSIONS_TABLE)
    .update({
      status: "cancelled",
      current_node_id: null,
      last_activity_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("flow_id", input.automationFlowId)
    .in("status", activeStatuses)
    .select("id");

  if (sessionsError) throw sessionsError;

  const { data: runs, error: runsError } = await client
    .from(RUNS_TABLE)
    .update({
      status: "cancelled",
      current_node_id: null,
      error_message: "Channel workflow binding disabled",
      finished_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("flow_id", input.automationFlowId)
    .in("status", ["pending", "running", "waiting_input"])
    .select("id");

  if (runsError) throw runsError;

  return {
    sessionCount: sessions?.length ?? 0,
    runCount: runs?.length ?? 0,
  };
}

/** Human-readable message from Supabase / unknown thrown values (avoids "[object Object]"). */
export function formatChannelWorkflowBindingError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error_description?: unknown; details?: unknown };
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error_description === "string" && record.error_description.trim()) {
      return record.error_description;
    }
    if (typeof record.details === "string" && record.details.trim()) return record.details;
  }
  if (typeof error === "string" && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export type FlowChannelBindingSnapshot = {
  id: string;
  companyChannelId: string;
  channel: string | null;
  isEnabled: boolean;
};

export async function listChannelWorkflowBindingsForFlow(
  client: SupabaseClient,
  companyId: string,
  automationFlowId: string,
): Promise<FlowChannelBindingSnapshot[]> {
  // Avoid nested PostgREST embeds — `company_channels(channel)` 400s because the
  // column is `channel_id` → `communication_channels.key`, not `channel`.
  const { data, error } = await client
    .from(BINDINGS_TABLE)
    .select("id, company_channel_id, is_enabled")
    .eq("company_id", companyId)
    .eq("automation_flow_id", automationFlowId)
    .eq("is_enabled", true)
    .is("deleted_at", null);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const companyChannelIds = [...new Set(rows.map((row) => row.company_channel_id as string))];
  const { data: companyChannels, error: companyChannelsError } = await client
    .from("company_channels")
    .select("id, channel_id")
    .in("id", companyChannelIds)
    .is("deleted_at", null);

  if (companyChannelsError) throw companyChannelsError;

  const channelTypeIds = [
    ...new Set((companyChannels ?? []).map((row) => row.channel_id as string).filter(Boolean)),
  ];
  const channelKeyByTypeId = new Map<string, string>();
  if (channelTypeIds.length > 0) {
    const { data: channelTypes, error: channelTypesError } = await client
      .from("communication_channels")
      .select("id, key")
      .in("id", channelTypeIds);

    if (channelTypesError) throw channelTypesError;
    for (const row of channelTypes ?? []) {
      channelKeyByTypeId.set(row.id as string, row.key as string);
    }
  }

  const channelKeyByCompanyChannelId = new Map<string, string | null>();
  for (const row of companyChannels ?? []) {
    channelKeyByCompanyChannelId.set(
      row.id as string,
      channelKeyByTypeId.get(row.channel_id as string) ?? null,
    );
  }

  return rows.map((row) => ({
    id: row.id as string,
    companyChannelId: row.company_channel_id as string,
    channel: channelKeyByCompanyChannelId.get(row.company_channel_id as string) ?? null,
    isEnabled: Boolean(row.is_enabled),
  }));
}

export async function fetchChannelWorkflowBinding(
  client: SupabaseClient,
  companyChannelId: string,
): Promise<ChannelWorkflowBindingRecord | null> {
  const { data, error } = await client
    .from(BINDINGS_TABLE)
    .select("id, company_id, company_channel_id, automation_flow_id, is_enabled")
    .eq("company_channel_id", companyChannelId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapBinding(data as Record<string, unknown>) : null;
}

export async function listCompanyChannelWorkflowBindings(
  client: SupabaseClient,
  companyId: string,
): Promise<ChannelWorkflowBindingListItem[]> {
  const { data, error } = await client
    .from(BINDINGS_TABLE)
    .select("id, company_id, company_channel_id, automation_flow_id, is_enabled, automation_flows(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const flows = row.automation_flows as { name?: string } | { name?: string }[] | null;
    const flowName = Array.isArray(flows) ? flows[0]?.name : flows?.name;
    return {
      ...mapBinding(row as Record<string, unknown>),
      flowName: typeof flowName === "string" && flowName.trim() ? flowName.trim() : null,
    };
  });
}

export async function fetchActiveAutomationFlows(
  client: SupabaseClient,
  companyId: string,
): Promise<ActiveAutomationFlowOption[]> {
  const { data, error } = await client
    .from(FLOWS_TABLE)
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export function resolveChannelWorkflowBindingSave(
  input: SaveChannelWorkflowBindingInput,
): SaveChannelWorkflowBindingResult | { action: "invalid"; reason: "missing_flow" } {
  const { existingBinding, workflowEnabled, automationFlowId } = input;

  if (workflowEnabled && !automationFlowId) {
    return { action: "invalid", reason: "missing_flow" };
  }

  if (!existingBinding) {
    if (!workflowEnabled || !automationFlowId) return { action: "noop" };
    return { action: "created", bindingId: "pending" };
  }

  if (!automationFlowId) {
    return { action: "removed", bindingId: existingBinding.id };
  }

  if (!workflowEnabled) {
    return { action: "disabled", bindingId: existingBinding.id };
  }

  if (existingBinding.automationFlowId === automationFlowId && existingBinding.isEnabled) {
    return { action: "noop" };
  }

  return { action: "updated", bindingId: existingBinding.id };
}

export async function saveChannelWorkflowBinding(
  client: SupabaseClient,
  input: SaveChannelWorkflowBindingInput,
): Promise<SaveChannelWorkflowBindingResult> {
  const resolved = resolveChannelWorkflowBindingSave(input);
  if (resolved.action === "invalid") {
    throw new Error("Select a workflow before enabling automation.");
  }
  if (resolved.action === "noop") {
    return resolved;
  }

  const now = new Date().toISOString();

  if (resolved.action === "disabled") {
    const { error } = await client
      .from(BINDINGS_TABLE)
      .update({ is_enabled: false, updated_at: now })
      .eq("id", resolved.bindingId);
    if (error) throw error;
    if (input.automationFlowId) {
      try {
        await cancelActiveAutomationSessionsForFlow(client, {
          companyId: input.companyId,
          automationFlowId: input.automationFlowId,
        });
      } catch (cancelError) {
        // Binding is already off; do not roll back or fail the UI save on cleanup errors.
        console.warn("[channel-workflow-binding] failed to cancel active sessions", cancelError);
      }
    }
    return resolved;
  }

  if (resolved.action === "removed") {
    const { error } = await client
      .from(BINDINGS_TABLE)
      .update({ is_enabled: false, deleted_at: now, updated_at: now })
      .eq("id", resolved.bindingId);
    if (error) throw error;
    if (input.existingBinding?.automationFlowId) {
      try {
        await cancelActiveAutomationSessionsForFlow(client, {
          companyId: input.companyId,
          automationFlowId: input.existingBinding.automationFlowId,
        });
      } catch (cancelError) {
        console.warn("[channel-workflow-binding] failed to cancel active sessions", cancelError);
      }
    }
    return resolved;
  }

  if (resolved.action === "created") {
    const { data, error } = await client
      .from(BINDINGS_TABLE)
      .insert({
        company_id: input.companyId,
        company_channel_id: input.companyChannelId,
        automation_flow_id: input.automationFlowId,
        is_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { action: "created", bindingId: data.id as string };
  }

  const { error } = await client
    .from(BINDINGS_TABLE)
    .update({
      automation_flow_id: input.automationFlowId,
      is_enabled: true,
      deleted_at: null,
      updated_at: now,
    })
    .eq("id", resolved.bindingId);
  if (error) throw error;
  return resolved;
}
