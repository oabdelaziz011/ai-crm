import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeReadPort, KnowledgeDocumentModel } from "@workspace/application-layer";
import { createKnowledgePlatformServices } from "@workspace/knowledge-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function buildKnowledgeContext(ctx: LoginAppPortContext) {
  return {
    userId: ctx.actorUserId,
    companyId: ctx.companyId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
    isKnowledgeFeatureEnabled: () => true,
  };
}

function canRead(ctx: LoginAppPortContext): boolean {
  return ctx.isSuperAdmin || ctx.hasPermission("knowledge.read");
}

export function createLoginAppKnowledgeReadPort(client: SupabaseClient, ctx: LoginAppPortContext): KnowledgeReadPort {
  const knowledge = createKnowledgePlatformServices(client);

  return {
    async getDocument(tenantId, documentId): Promise<KnowledgeDocumentModel | null> {
      if (tenantId !== ctx.companyId || !canRead(ctx)) return null;
      try {
        const doc = await knowledge.documents.getDocument(buildKnowledgeContext(ctx), documentId);
        return Object.freeze({
          id: doc.id,
          title: doc.title,
          updatedAt: doc.updated_at,
        });
      } catch {
        return null;
      }
    },

    async search(tenantId, query, options) {
      if (tenantId !== ctx.companyId || !canRead(ctx)) {
        return Object.freeze({ query, documents: Object.freeze([]), chunks: Object.freeze([]), confidence: 0 });
      }

      try {
        const limit = options?.limit ?? 8;
        const docs = await knowledge.documents.listDocuments(buildKnowledgeContext(ctx), {
          companyId: tenantId,
          status: "published",
          limit: 50,
        });

        const normalized = query.trim().toLowerCase();
        const matched = docs
          .filter((doc) => !normalized || doc.title.toLowerCase().includes(normalized))
          .slice(0, limit)
          .map((doc) =>
            Object.freeze({
              id: doc.id,
              title: doc.title,
              updatedAt: doc.updated_at,
            }),
          );

        const { data: chunkRows } = await client
          .from("knowledge_chunks")
          .select("id, content, document_id, knowledge_documents(title)")
          .eq("company_id", tenantId)
          .ilike("content", `%${query}%`)
          .limit(limit);

        const chunks = (chunkRows ?? []).map((row) => {
          const docJoin = row.knowledge_documents as { title?: string } | null;
          return Object.freeze({
            id: String(row.id),
            content: String(row.content),
            documentId: String(row.document_id),
            documentTitle: docJoin?.title,
            score: normalized ? 0.75 : 0.5,
          });
        });

        const confidence = chunks.length > 0 ? 0.8 : matched.length > 0 ? 0.5 : 0;

        return Object.freeze({
          query,
          documents: Object.freeze(matched),
          chunks: Object.freeze(chunks),
          confidence,
        });
      } catch {
        return Object.freeze({ query, documents: Object.freeze([]), chunks: Object.freeze([]), confidence: 0 });
      }
    },
  };
}
