import type { SupabaseClient } from "@supabase/supabase-js";
import { PGVECTOR_MAX_DIMENSIONS } from "../../constants.js";
import { VectorStoreConfigurationError } from "../../errors.js";

export type PgVectorCollectionRecord = {
  companyId: string;
  collectionName: string;
  dimensions: number;
  metadata: Record<string, unknown>;
};

export type PgVectorStoredVector = {
  id: string;
  companyId: string;
  collectionName: string;
  vectorId: string;
  dimensions: number;
  vector: number[];
  metadata: Record<string, unknown>;
};

export type PgVectorSimilarityHit = {
  vectorId: string;
  providerScore: number;
  metadata: Record<string, unknown>;
};

export interface PgVectorStoragePort {
  health(): Promise<{ ok: boolean; message: string }>;
  createCollection(input: PgVectorCollectionRecord): Promise<void>;
  deleteCollection(companyId: string, collectionName: string): Promise<void>;
  upsertVector(input: {
    companyId: string;
    collectionName: string;
    vectorId: string;
    vector: number[];
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  deleteVector(companyId: string, collectionName: string, vectorId: string): Promise<void>;
  collectionStatistics(companyId: string, collectionName: string): Promise<{ vectorCount: number; dimensions: number }>;
  similaritySearch(input: {
    companyId: string;
    collectionName: string;
    queryVector: number[];
    topK: number;
    metadataFilter?: Record<string, unknown>;
  }): Promise<PgVectorSimilarityHit[]>;
}

export function resolveCompanyId(configuration: Record<string, unknown>): string {
  const companyId = configuration.companyId;
  if (typeof companyId !== "string" || !companyId.trim()) {
    throw new VectorStoreConfigurationError("pgvector adapter requires configuration.companyId.");
  }
  return companyId;
}

export function assertVectorDimensions(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw new VectorStoreConfigurationError(
      `Vector dimensions (${vector.length}) do not match collection dimensions (${dimensions}).`,
    );
  }
  if (vector.length > PGVECTOR_MAX_DIMENSIONS) {
    throw new VectorStoreConfigurationError(
      `Vector dimensions (${vector.length}) exceed pgvector maximum (${PGVECTOR_MAX_DIMENSIONS}).`,
    );
  }
}

export class InMemoryPgVectorStorage implements PgVectorStoragePort {
  private readonly collections = new Map<string, PgVectorCollectionRecord>();
  private readonly vectors = new Map<string, PgVectorStoredVector>();

  private key(companyId: string, collectionName: string, vectorId?: string): string {
    return vectorId ? `${companyId}:${collectionName}:${vectorId}` : `${companyId}:${collectionName}`;
  }

  async health() {
    return { ok: true, message: "In-memory pgvector storage is available." };
  }

  async createCollection(input: PgVectorCollectionRecord) {
    this.collections.set(this.key(input.companyId, input.collectionName), input);
  }

  async deleteCollection(companyId: string, collectionName: string) {
    this.collections.delete(this.key(companyId, collectionName));
    for (const [key, value] of this.vectors.entries()) {
      if (value.companyId === companyId && value.collectionName === collectionName) {
        this.vectors.delete(key);
      }
    }
  }

  async upsertVector(input: {
    companyId: string;
    collectionName: string;
    vectorId: string;
    vector: number[];
    metadata?: Record<string, unknown>;
  }) {
    const collection = this.collections.get(this.key(input.companyId, input.collectionName));
    if (!collection) {
      throw new VectorStoreConfigurationError(`Collection ${input.collectionName} does not exist.`);
    }
    assertVectorDimensions(input.vector, collection.dimensions);

    const id = this.key(input.companyId, input.collectionName, input.vectorId);
    this.vectors.set(id, {
      id,
      companyId: input.companyId,
      collectionName: input.collectionName,
      vectorId: input.vectorId,
      dimensions: collection.dimensions,
      vector: [...input.vector],
      metadata: input.metadata ?? {},
    });
    return { id };
  }

  async deleteVector(companyId: string, collectionName: string, vectorId: string) {
    this.vectors.delete(this.key(companyId, collectionName, vectorId));
  }

  async collectionStatistics(companyId: string, collectionName: string) {
    const collection = this.collections.get(this.key(companyId, collectionName));
    const vectorCount = [...this.vectors.values()].filter(
      (vector) => vector.companyId === companyId && vector.collectionName === collectionName,
    ).length;
    return { vectorCount, dimensions: collection?.dimensions ?? 0 };
  }

  async similaritySearch(input: {
    companyId: string;
    collectionName: string;
    queryVector: number[];
    topK: number;
    metadataFilter?: Record<string, unknown>;
  }) {
    const candidates = [...this.vectors.values()].filter(
      (vector) => vector.companyId === input.companyId && vector.collectionName === input.collectionName,
    );

    const filtered = candidates.filter((candidate) => {
      if (!input.metadataFilter || Object.keys(input.metadataFilter).length === 0) return true;
      return Object.entries(input.metadataFilter).every(
        ([key, value]) => String(candidate.metadata[key]) === String(value),
      );
    });

    return filtered
      .map((candidate) => ({
        vectorId: candidate.vectorId,
        providerScore: cosineSimilarityPercent(input.queryVector, candidate.vector),
        metadata: candidate.metadata,
      }))
      .sort((left, right) => right.providerScore - left.providerScore)
      .slice(0, input.topK);
  }
}

export class SupabasePgVectorStorage implements PgVectorStoragePort {
  constructor(private readonly client: SupabaseClient) {}

  async health() {
    const { error } = await this.client.from("pgvector_store_collections").select("id").limit(1);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: "Supabase pgvector storage is reachable." };
  }

  async createCollection(input: PgVectorCollectionRecord) {
    const { error } = await this.client.rpc("pgvector_create_collection", {
      p_company_id: input.companyId,
      p_collection_name: input.collectionName,
      p_dimensions: input.dimensions,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
  }

  async deleteCollection(companyId: string, collectionName: string) {
    const { error } = await this.client.rpc("pgvector_delete_collection", {
      p_company_id: companyId,
      p_collection_name: collectionName,
    });
    if (error) throw error;
  }

  async upsertVector(input: {
    companyId: string;
    collectionName: string;
    vectorId: string;
    vector: number[];
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await this.client.rpc("pgvector_upsert_vector", {
      p_company_id: input.companyId,
      p_collection_name: input.collectionName,
      p_vector_id: input.vectorId,
      p_vector: input.vector,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
    const payload = data as { id?: string } | null;
    return { id: payload?.id ?? input.vectorId };
  }

  async deleteVector(companyId: string, collectionName: string, vectorId: string) {
    const { error } = await this.client.rpc("pgvector_delete_vector", {
      p_company_id: companyId,
      p_collection_name: collectionName,
      p_vector_id: vectorId,
    });
    if (error) throw error;
  }

  async collectionStatistics(companyId: string, collectionName: string) {
    const { data, error } = await this.client.rpc("pgvector_collection_statistics", {
      p_company_id: companyId,
      p_collection_name: collectionName,
    });
    if (error) throw error;
    const payload = data as { vectorCount?: number; dimensions?: number } | null;
    return {
      vectorCount: Number(payload?.vectorCount ?? 0),
      dimensions: Number(payload?.dimensions ?? 0),
    };
  }

  async similaritySearch(input: {
    companyId: string;
    collectionName: string;
    queryVector: number[];
    topK: number;
    metadataFilter?: Record<string, unknown>;
  }) {
    const { data, error } = await this.client.rpc("pgvector_similarity_search", {
      p_company_id: input.companyId,
      p_collection_name: input.collectionName,
      p_query_vector: input.queryVector,
      p_top_k: input.topK,
      p_metadata_filter: input.metadataFilter ?? {},
    });
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => ({
      vectorId: String(row.vector_id),
      providerScore: Number(row.provider_score ?? 0),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }
}

function cosineSimilarityPercent(queryVector: number[], candidateVector: number[]): number {
  const length = Math.min(queryVector.length, candidateVector.length);
  if (length === 0) return 0;

  let dot = 0;
  let queryNorm = 0;
  let candidateNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const queryValue = queryVector[index] ?? 0;
    const candidateValue = candidateVector[index] ?? 0;
    dot += queryValue * candidateValue;
    queryNorm += queryValue * queryValue;
    candidateNorm += candidateValue * candidateValue;
  }

  if (queryNorm === 0 || candidateNorm === 0) return 0;
  return Number(((dot / (Math.sqrt(queryNorm) * Math.sqrt(candidateNorm))) * 100).toFixed(6));
}
