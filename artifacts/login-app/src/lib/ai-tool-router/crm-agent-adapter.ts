import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseCrmAgentToolPorts,
  type CrmKnowledgeRetriever,
} from "@workspace/ai-tool-router";

export type { CrmKnowledgeRetriever };

export type CreateCrmAgentToolPortsOptions = {
  client: SupabaseClient;
  getActorUserId: () => string | null;
  retrieveKnowledge?: CrmKnowledgeRetriever;
};

export function createCrmAgentToolPorts(options: CreateCrmAgentToolPortsOptions) {
  const { client, getActorUserId, retrieveKnowledge } = options;
  return createSupabaseCrmAgentToolPorts(client, {
    getActorUserId,
    retrieveKnowledge,
  });
}
