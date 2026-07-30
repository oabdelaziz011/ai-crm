import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  ImmutableVersionError,
  KnowledgeDocumentNotFoundError,
  KnowledgeVersionNotFoundError,
} from "../errors.js";
import type { KnowledgeDocumentRepository, KnowledgeVersionRepository } from "../repositories/knowledge-repositories.js";
import type { ListKnowledgeVersionsFilter, ServiceContext } from "../types.js";
import {
  assertCompanyAccess,
  assertKnowledgeFeatureEnabled,
  assertPermission,
} from "../utils/knowledge-guards.js";

export class KnowledgeVersionService {
  constructor(
    private readonly versionRepository: KnowledgeVersionRepository,
    private readonly documentRepository: KnowledgeDocumentRepository,
  ) {}

  async createDraftVersion(
    ctx: ServiceContext,
    input: { companyId: string; documentId: string; checksum: string; mimeType?: string; metadata?: Record<string, unknown> },
  ) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const document = await this.documentRepository.findById(input.documentId);
    if (!document || document.company_id !== input.companyId) throw new KnowledgeDocumentNotFoundError(input.documentId);

    const nextVersionNumber = document.current_version_number + 1;
    const version = await this.versionRepository.create({
      companyId: input.companyId,
      documentId: input.documentId,
      versionNumber: nextVersionNumber,
      checksum: input.checksum,
      mimeType: input.mimeType,
      metadata: input.metadata,
      createdBy: ctx.userId,
    });

    await this.documentRepository.update({
      documentId: input.documentId,
      currentVersionNumber: nextVersionNumber,
      checksum: input.checksum,
      status: "draft",
    });

    return version;
  }

  async publishVersion(ctx: ServiceContext, versionId: string) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.publish);

    const version = await this.versionRepository.findById(versionId);
    if (!version) throw new KnowledgeVersionNotFoundError(versionId);
    assertCompanyAccess(ctx, version.company_id);
    if (version.is_immutable && version.status === "published") {
      return version;
    }
    if (version.is_immutable) throw new ImmutableVersionError(versionId);

    const published = await this.versionRepository.publish(versionId, ctx.userId);
    await this.documentRepository.update({
      documentId: version.document_id,
      status: "published",
      publishedVersionId: published.id,
      currentVersionNumber: published.version_number,
      checksum: published.checksum,
    });

    return published;
  }

  async archiveVersion(ctx: ServiceContext, versionId: string) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const version = await this.versionRepository.findById(versionId);
    if (!version) throw new KnowledgeVersionNotFoundError(versionId);
    assertCompanyAccess(ctx, version.company_id);
    return this.versionRepository.archive(versionId);
  }

  async rollbackToVersion(ctx: ServiceContext, documentId: string, targetVersionNumber: number) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    const target = await this.versionRepository.findByDocumentAndNumber(documentId, targetVersionNumber);
    if (!target) throw new KnowledgeVersionNotFoundError(`${documentId}@${targetVersionNumber}`);

    return this.createDraftVersion(ctx, {
      companyId: document.company_id,
      documentId,
      checksum: target.checksum,
      mimeType: target.mime_type,
      metadata: { ...target.metadata, rolled_back_from: target.version_number },
    });
  }

  async listVersions(ctx: ServiceContext, filter: ListKnowledgeVersionsFilter) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.versionRepository.list(filter);
  }

  async getVersion(ctx: ServiceContext, versionId: string) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    const version = await this.versionRepository.findById(versionId);
    if (!version) throw new KnowledgeVersionNotFoundError(versionId);
    assertCompanyAccess(ctx, version.company_id);
    return version;
  }
}
