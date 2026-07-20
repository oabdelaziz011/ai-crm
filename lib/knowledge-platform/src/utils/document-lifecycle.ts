import type { DocumentStatus } from "../constants.js";

export type DocumentLifecycleMetadata = {
  archived_from_status?: DocumentStatus | null;
  archived_at?: string | null;
  archived_by?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  last_published_at?: string | null;
  last_published_by?: string | null;
  retrieval_available?: boolean;
};

export type DocumentEmbeddingQueueMetadata = {
  started_at?: string | null;
  completed_at?: string | null;
  jobs_created?: number;
  jobs_skipped?: number;
  jobs_duplicate?: number;
  invalid_chunks_skipped?: number;
  queued_job_count?: number;
};

export type DocumentIndexingMetadata = {
  worker_started_at?: string | null;
  completed_at?: string | null;
  indexed_chunk_count?: number;
  total_chunk_count?: number;
  failed_chunk_count?: number;
  last_embedding_provider?: string | null;
  embedding_model?: string | null;
  indexing_duration_ms?: number | null;
  vector_indexed_count?: number;
};

export type DocumentPublishingMetadata = {
  prepared_at?: string | null;
  embedding_status?: "pending" | "queued" | "processing" | "completed" | "failed";
  retrieval_available?: boolean;
  queued_at?: string | null;
  queue?: DocumentEmbeddingQueueMetadata;
  indexing?: DocumentIndexingMetadata;
};

export const EDITABLE_DOCUMENT_STATUSES = ["draft"] as const satisfies readonly DocumentStatus[];
export const PUBLISHABLE_DOCUMENT_STATUSES = ["draft"] as const satisfies readonly DocumentStatus[];
export const ARCHIVABLE_DOCUMENT_STATUSES = ["published", "indexing", "indexed"] as const satisfies readonly DocumentStatus[];
export const DELETABLE_DOCUMENT_STATUSES = ["draft", "archived"] as const satisfies readonly DocumentStatus[];

export function getLifecycleMetadata(metadata: Record<string, unknown>): DocumentLifecycleMetadata {
  const lifecycle = metadata.lifecycle;
  if (!lifecycle || typeof lifecycle !== "object") return {};
  return lifecycle as DocumentLifecycleMetadata;
}

export function getPublishingMetadata(metadata: Record<string, unknown>): DocumentPublishingMetadata {
  const publishing = metadata.publishing;
  if (!publishing || typeof publishing !== "object") return {};
  return publishing as DocumentPublishingMetadata;
}

export function isRetrievalAvailable(metadata: Record<string, unknown>, status: DocumentStatus): boolean {
  if (status === "archived") return false;
  const lifecycle = getLifecycleMetadata(metadata);
  if (lifecycle.retrieval_available === false) return false;
  const publishing = getPublishingMetadata(metadata);
  if (publishing.retrieval_available === false) return false;
  return status === "published" || status === "indexing" || status === "indexed";
}

export function mergeDocumentMetadata(
  metadata: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...metadata, ...patch };
}

export function withLifecycleMetadata(
  metadata: Record<string, unknown>,
  lifecycle: DocumentLifecycleMetadata,
): Record<string, unknown> {
  return mergeDocumentMetadata(metadata, {
    lifecycle: {
      ...getLifecycleMetadata(metadata),
      ...lifecycle,
    },
  });
}

export function withPublishingMetadata(
  metadata: Record<string, unknown>,
  publishing: DocumentPublishingMetadata,
): Record<string, unknown> {
  const current = getPublishingMetadata(metadata);
  const queuePatch = publishing.queue;
  const indexingPatch = publishing.indexing;
  return mergeDocumentMetadata(metadata, {
    publishing: {
      ...current,
      ...publishing,
      queue: queuePatch
        ? {
            ...(current.queue ?? {}),
            ...queuePatch,
          }
        : current.queue,
      indexing: indexingPatch
        ? {
            ...(current.indexing ?? {}),
            ...indexingPatch,
          }
        : current.indexing,
    },
  });
}

export function getEmbeddingQueueMetadata(metadata: Record<string, unknown>): DocumentEmbeddingQueueMetadata {
  const publishing = getPublishingMetadata(metadata);
  return publishing.queue ?? {};
}
