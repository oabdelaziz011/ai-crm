import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeywordSearchHit, KeywordSearchPort } from "../ports/keyword-search-port.js";

export function createSupabaseKeywordSearchPort(client: SupabaseClient): KeywordSearchPort {
  return {
    async search(input) {
      const { data, error } = await client.rpc("knowledge_keyword_search", {
        p_company_id: input.companyId,
        p_query: input.query,
        p_limit: input.limit ?? 20,
        p_source_ids: input.sourceIds?.length ? input.sourceIds : null,
        p_document_ids: input.documentIds?.length ? input.documentIds : null,
      });
      if (error) throw error;

      return ((data ?? []) as Record<string, unknown>[]).map((row, index) => ({
        chunkId: row.chunk_id as string,
        documentId: row.document_id as string,
        sourceId: row.source_id as string,
        documentTitle: row.document_title as string,
        sectionTitle: (row.section_title as string) ?? "",
        content: row.content as string,
        score: Number(row.rank ?? 0),
        pageNumber: row.page_number != null ? Number(row.page_number) : null,
        rank: index + 1,
      })) satisfies KeywordSearchHit[];
    },
  };
}
