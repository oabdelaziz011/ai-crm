import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveAutomationFlowOption,
  ChannelWorkflowBindingRecord,
  SaveChannelWorkflowBindingInput,
  SaveChannelWorkflowBindingResult,
} from "./types";

const BINDINGS_TABLE = "company_channel_automation_bindings";
const FLOWS_TABLE = "automation_flows";

function mapBinding(row: Record<string, unknown>): ChannelWorkflowBindingRecord {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    companyChannelId: row.company_channel_id as string,
    automationFlowId: row.automation_flow_id as string,
    isEnabled: Boolean(row.is_enabled),
  };
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
  const { data, error } = await client
    .from(BINDINGS_TABLE)
    .select("id, company_channel_id, is_enabled, company_channels(channel)")
    .eq("company_id", companyId)
    .eq("automation_flow_id", automationFlowId)
    .eq("is_enabled", true)
    .is("deleted_at", null);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const channels = row.company_channels as { channel?: string } | { channel?: string }[] | null;
    const channelValue = Array.isArray(channels) ? channels[0]?.channel : channels?.channel;
    return {
      id: row.id as string,
      companyChannelId: row.company_channel_id as string,
      channel: channelValue ?? null,
      isEnabled: Boolean(row.is_enabled),
    };
  });
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
    return resolved;
  }

  if (resolved.action === "removed") {
    const { error } = await client
      .from(BINDINGS_TABLE)
      .update({ is_enabled: false, deleted_at: now, updated_at: now })
      .eq("id", resolved.bindingId);
    if (error) throw error;
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
