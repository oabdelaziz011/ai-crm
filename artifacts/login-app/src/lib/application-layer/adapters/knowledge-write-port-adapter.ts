import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeWritePort, KnowledgeDocumentModel } from "@workspace/application-layer";
import { createKnowledgePlatformServices } from "@workspace/knowledge-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function buildKnowledgeContext(ctx: LoginAppPortContext) {
  return {
    userId: ctx.actorUserId,
    companyId: ctx.companyId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
    isKnowledgeFeatureEnabled: () => ctx.hasPermission("knowledge.write") || ctx.isSuperAdmin,
  };
}

export function createLoginAppKnowledgeWritePort(client: SupabaseClient, ctx: LoginAppPortContext): KnowledgeWritePort {
  const knowledge = createKnowledgePlatformServices(client);

  return {
    async publishDocument(input): Promise<KnowledgeDocumentModel> {
      if (input.tenantId !== ctx.companyId || !ctx.hasPermission("knowledge.write")) {
        throw new Error("Permission denied");
      }
      const doc = await knowledge.publishing.publishDocument(buildKnowledgeContext(ctx), input.documentId);
      return Object.freeze({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updated_at,
      });
    },
  };
}
