import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomer360Loader, createSupabaseCustomer360DataPort } from "@workspace/customer-360";
import { createKnowledgeRuntimeProvider } from "@workspace/knowledge-runtime";
import type { RetrievalServices } from "@workspace/retrieval-engine";
import type { RuntimeEnginePortOptions } from "@workspace/runtime-integration";

export function createDashboardRuntimeEnginePortOptions(
  client: SupabaseClient,
  retrieval: RetrievalServices,
  resolveActorUserId?: (companyId: string) => Promise<string | null>,
): RuntimeEnginePortOptions {
  return {
    promptMode: "dashboard",
    customer360Loader: createCustomer360Loader(
      createSupabaseCustomer360DataPort(client, {
        resolveActorUserIdForCompany: resolveActorUserId ?? (async () => null),
      }),
    ),
    knowledgeRuntimeProvider: createKnowledgeRuntimeProvider(retrieval.knowledge),
    resolveActorUserId,
  };
}
