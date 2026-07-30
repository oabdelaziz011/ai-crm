import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeVersionNotFoundError,
  ValidationError,
} from "../errors.js";
import type {
  KnowledgeChunkRepository,
  KnowledgeDocumentRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import type { KnowledgeDocumentRecord, KnowledgeDocumentVersionRecord, ServiceContext } from "../types.js";
import {
  ARCHIVABLE_DOCUMENT_STATUSES,
  DELETABLE_DOCUMENT_STATUSES,
  getLifecycleMetadata,
  isRetrievalAvailable,
  withLifecycleMetadata,
  withPublishingMetadata,
} from "../utils/document-lifecycle.js";
import {
  assertCompanyAccess,
  assertKnowledgeFeatureEnabled,
  assertPermission,
} from "../utils/knowledge-guards.js";
import type { KnowledgeEmbeddingQueuePort } from "../ports/knowledge-embedding-queue-port.js";
import type { KnowledgeVersionService } from "./knowledge-version-service.js";

async function enqueueAfterPublish(
  queuePort: KnowledgeEmbeddingQueuePort | undefined,
  ctx: ServiceContext,
  input: { documentId: string; versionId: string; companyId: string; document: KnowledgeDocumentRecord },
): Promise<KnowledgeDocumentRecord> {
  if (!queuePort) return input.document;
  try {
    const queueResult = await queuePort.buildQueueForPublishedDocument(ctx, {
      documentId: input.documentId,
      versionId: input.versionId,
      companyId: input.companyId,
    });
    return queueResult.document;
  } catch {
    return input.document;
  }
}

export type PublishDocumentResult = {
  document: KnowledgeDocumentRecord;
  version: KnowledgeDocumentVersionRecord;
  idempotent: boolean;
};

export type ArchiveDocumentResult = {
  document: KnowledgeDocumentRecord;
  previousStatus: KnowledgeDocumentRecord["status"];
};

export type RestoreDocumentResult = {
  document: KnowledgeDocumentRecord;
  restoredStatus: KnowledgeDocumentRecord["status"];
};

export class KnowledgePublishingService {
  constructor(
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
    private readonly chunkRepository: KnowledgeChunkRepository,
    private readonly versionService: KnowledgeVersionService,
    private readonly embeddingQueue?: KnowledgeEmbeddingQueuePort,
  ) {}

  async publishDocument(ctx: ServiceContext, documentId: string): Promise<PublishDocumentResult> {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.publish);

    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    if (document.status === "archived") {
      throw new ValidationError("Archived documents cannot be published. Restore the document first.");
    }

    if (document.status === "published" || document.status === "indexing" || document.status === "indexed") {
      if (!document.published_version_id) {
        throw new ValidationError("Published document is missing published_version_id.");
      }
      const existingVersion = await this.versionRepository.findById(document.published_version_id);
      if (!existingVersion) throw new KnowledgeVersionNotFoundError(document.published_version_id);
      const queuedDocument = await enqueueAfterPublish(this.embeddingQueue, ctx, {
        documentId: document.id,
        versionId: existingVersion.id,
        companyId: document.company_id,
        document,
      });
      return { document: queuedDocument, version: existingVersion, idempotent: true };
    }

    if (document.status !== "draft") {
      throw new ValidationError(`Document status ${document.status} cannot be published.`);
    }

    if (!document.checksum?.trim()) {
      throw new ValidationError("Document integrity validation failed: checksum is required.");
    }

    const version = await this.versionRepository.findByDocumentAndNumber(
      document.id,
      document.current_version_number,
    );
    if (!version) {
      throw new KnowledgeVersionNotFoundError(`${document.id}@${document.current_version_number}`);
    }
    if (version.status !== "draft") {
      throw new ValidationError("Only draft versions can be published.");
    }

    const chunks = await this.chunkRepository.list({
      companyId: document.company_id,
      documentId: document.id,
      versionId: version.id,
    });
    if (chunks.length === 0) {
      throw new ValidationError("Document integrity validation failed: at least one chunk is required before publishing.");
    }

    const publishedVersion = await this.versionService.publishVersion(ctx, version.id);
    const now = new Date().toISOString();
    const updatedDocument = await this.documentRepository.update({
      documentId: document.id,
      metadata: withPublishingMetadata(
        withLifecycleMetadata(document.metadata, {
          last_published_at: now,
          last_published_by: ctx.userId,
          retrieval_available: true,
        }),
        {
          prepared_at: now,
          embedding_status: "pending",
          retrieval_available: true,
        },
      ),
    });

    const queuedDocument = await enqueueAfterPublish(this.embeddingQueue, ctx, {
      documentId: document.id,
      versionId: publishedVersion.id,
      companyId: document.company_id,
      document: updatedDocument,
    });

    return {
      document: queuedDocument,
      version: publishedVersion,
      idempotent: false,
    };
  }

  async archiveDocument(ctx: ServiceContext, documentId: string): Promise<ArchiveDocumentResult> {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);

    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    if (document.status === "archived") {
      return { document, previousStatus: getLifecycleMetadata(document.metadata).archived_from_status ?? "published" };
    }

    if (!ARCHIVABLE_DOCUMENT_STATUSES.includes(document.status as (typeof ARCHIVABLE_DOCUMENT_STATUSES)[number])) {
      throw new ValidationError(`Document status ${document.status} cannot be archived.`);
    }

    const previousStatus = document.status;
    const updatedDocument = await this.documentRepository.update({
      documentId,
      status: "archived",
      metadata: withLifecycleMetadata(
        withPublishingMetadata(document.metadata, { retrieval_available: false }),
        {
          archived_from_status: previousStatus,
          archived_at: new Date().toISOString(),
          archived_by: ctx.userId,
          retrieval_available: false,
        },
      ),
    });

    return { document: updatedDocument, previousStatus };
  }

  async restoreDocument(ctx: ServiceContext, documentId: string): Promise<RestoreDocumentResult> {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);

    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    if (document.status !== "archived") {
      throw new ValidationError("Only archived documents can be restored.");
    }

    const lifecycle = getLifecycleMetadata(document.metadata);
    const restoredStatus = lifecycle.archived_from_status ?? "published";
    if (restoredStatus === "archived" || restoredStatus === "draft") {
      throw new ValidationError("Archived document is missing a valid restore target.");
    }

    const retrievalAvailable = restoredStatus === "published" || restoredStatus === "indexing" || restoredStatus === "indexed";
    const updatedDocument = await this.documentRepository.update({
      documentId,
      status: restoredStatus,
      metadata: withLifecycleMetadata(
        withPublishingMetadata(document.metadata, { retrieval_available: retrievalAvailable }),
        {
          archived_from_status: null,
          archived_at: null,
          archived_by: null,
          restored_at: new Date().toISOString(),
          restored_by: ctx.userId,
          retrieval_available: retrievalAvailable,
        },
      ),
    });

    return { document: updatedDocument, restoredStatus };
  }

  async deleteDocument(ctx: ServiceContext, documentId: string): Promise<KnowledgeDocumentRecord> {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);

    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    if (!DELETABLE_DOCUMENT_STATUSES.includes(document.status as (typeof DELETABLE_DOCUMENT_STATUSES)[number])) {
      throw new ValidationError(`Document status ${document.status} cannot be deleted.`);
    }

    return this.documentRepository.softDelete({ id: documentId, deletedBy: ctx.userId });
  }

  isDocumentEditable(document: Pick<KnowledgeDocumentRecord, "status">): boolean {
    return document.status === "draft";
  }

  isDocumentRetrievalAvailable(document: Pick<KnowledgeDocumentRecord, "status" | "metadata">): boolean {
    return isRetrievalAvailable(document.metadata, document.status);
  }
}
