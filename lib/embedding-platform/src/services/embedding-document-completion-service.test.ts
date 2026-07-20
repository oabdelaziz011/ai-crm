import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KnowledgeDocumentRecord, KnowledgeDocumentRepository } from "@workspace/knowledge-platform";
import type { EmbeddingJobRepository } from "../repositories/embedding-repositories.js";
import type { EmbeddingJobRecord } from "../types.js";
import { EmbeddingDocumentCompletionService } from "./embedding-document-completion-service.js";

function createEnvironment() {
  let document: KnowledgeDocumentRecord = {
    id: "doc-1",
    company_id: "company-1",
    source_id: "source-1",
    title: "Policy",
    description: null,
    status: "indexing",
    mime_type: "text/plain",
    checksum: "doc-checksum",
    current_version_number: 1,
    published_version_id: "version-1",
    metadata: {
      publishing: {
        embedding_status: "queued",
        queue: { started_at: new Date(Date.now() - 5_000).toISOString(), queued_job_count: 2 },
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    deleted_by: null,
  };

  const jobs: EmbeddingJobRecord[] = [
    {
      id: "job-1",
      company_id: "company-1",
      knowledge_chunk_id: "chunk-1",
      connection_id: "connection-1",
      provider: "openai",
      model: "text-embedding-3-small",
      embedding_version: 1,
      status: "completed",
      retry_count: 0,
      max_retries: 3,
      error_message: null,
      result_embedding_id: "embedding-1",
      metadata: { documentId: "doc-1", versionId: "version-1" },
      queued_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      cancelled_at: null,
      locked_by: null,
      locked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
    },
    {
      id: "job-2",
      company_id: "company-1",
      knowledge_chunk_id: "chunk-2",
      connection_id: "connection-1",
      provider: "openai",
      model: "text-embedding-3-small",
      embedding_version: 1,
      status: "queued",
      retry_count: 0,
      max_retries: 3,
      error_message: null,
      result_embedding_id: null,
      metadata: { documentId: "doc-1", versionId: "version-1" },
      queued_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      locked_by: null,
      locked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
    },
  ];

  const documentRepository: KnowledgeDocumentRepository = {
    findById: async (id) => (id === document.id ? document : null),
    create: async () => {
      throw new Error("not implemented");
    },
    update: async (input) => {
      document = {
        ...document,
        ...(input.status ? { status: input.status } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        updated_at: new Date().toISOString(),
      };
      return document;
    },
    list: async () => [document],
    softDelete: async () => document,
  };

  const jobRepository: EmbeddingJobRepository = {
    create: async () => jobs[0]!,
    createMany: async (inputs) => inputs.map(() => jobs[0]!),
    findById: async (id) => jobs.find((item) => item.id === id) ?? null,
    list: async (filter) => jobs.filter((item) => item.company_id === filter.companyId),
    listByChunkIds: async () => jobs,
    listByDocumentVersion: async (filter) =>
      jobs.filter(
        (item) =>
          item.metadata.documentId === filter.documentId && item.metadata.versionId === filter.versionId,
      ),
    update: async (input) => {
      const job = jobs.find((item) => item.id === input.jobId)!;
      Object.assign(job, {
        status: input.status ?? job.status,
        retry_count: input.retryCount ?? job.retry_count,
        error_message: input.errorMessage ?? job.error_message,
        result_embedding_id: input.resultEmbeddingId ?? job.result_embedding_id,
      });
      return job;
    },
    claimNextQueued: async () => null,
    claimNextQueuedBatch: async () => [],
    recoverStaleLocks: async () => 0,
  };

  const service = new EmbeddingDocumentCompletionService(documentRepository, jobRepository);
  return { service, getDocument: () => document, jobs };
}

describe("EmbeddingDocumentCompletionService", () => {
  it("marks documents as processing while jobs remain queued", async () => {
    const env = createEnvironment();
    const result = await env.service.syncDocument(
      { userId: null, companyId: "company-1", isSuperAdmin: true, hasPermission: () => true },
      "company-1",
      "doc-1",
      "version-1",
    );

    assert.equal(result.status, "processing");
    assert.equal(env.getDocument().metadata.publishing?.embedding_status, "processing");
  });

  it("marks documents as indexed when all jobs complete", async () => {
    const env = createEnvironment();
    for (const job of env.jobs) {
      job.status = "completed";
      job.result_embedding_id = job.result_embedding_id ?? "embedding-id";
    }

    const result = await env.service.syncDocument(
      { userId: null, companyId: "company-1", isSuperAdmin: true, hasPermission: () => true },
      "company-1",
      "doc-1",
      "version-1",
    );

    assert.equal(result.status, "indexed");
    assert.equal(env.getDocument().status, "indexed");
    assert.equal(env.getDocument().metadata.publishing?.embedding_status, "completed");
  });

  it("keeps documents in indexing when jobs permanently fail", async () => {
    const env = createEnvironment();
    env.jobs[1]!.status = "failed";
    env.jobs[1]!.error_message = "provider unavailable";

    const result = await env.service.syncDocument(
      { userId: null, companyId: "company-1", isSuperAdmin: true, hasPermission: () => true },
      "company-1",
      "doc-1",
      "version-1",
    );

    assert.equal(result.status, "failed");
    assert.equal(env.getDocument().status, "indexing");
    assert.equal(env.getDocument().metadata.publishing?.embedding_status, "failed");
  });
});
