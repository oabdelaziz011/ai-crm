import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listChannelWorkflowBindingsForFlow,
  type FlowChannelBindingSnapshot,
} from "@/lib/channel-workflow-binding/channel-workflow-binding-repository";

export type FlowChannelBinding = FlowChannelBindingSnapshot;

export class TriggerBindingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listBindingsForFlow(companyId: string, flowId: string): Promise<FlowChannelBinding[]> {
    return listChannelWorkflowBindingsForFlow(this.client, companyId, flowId);
  }
}

export { type FlowChannelBindingSnapshot };
