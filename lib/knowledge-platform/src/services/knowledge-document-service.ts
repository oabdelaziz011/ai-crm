import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  DocumentLockedError,
  KnowledgeDocumentNotFoundError,
  KnowledgeSourceNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type {
  KnowledgeDocumentRepository,
  KnowledgeSourceRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import type {
  CreateKnowledgeDocumentInput,
  ListKnowledgeDocumentsFilter,
  ServiceContext,
  UpdateKnowledgeDocumentInput,
} from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(KNOWLEDGE_PERMISSIONS.view);
}

export class KnowledgeDocumentService {
  constructor(
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly sourceRepository: KnowledgeSourceRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
  ) {}

  async createDocument(ctx: ServiceContext, input: CreateKnowledgeDocumentInput) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const source = await this.sourceRepository.findById(input.sourceId);
    if (!source || source.company_id !== input.companyId) throw new KnowledgeSourceNotFoundError(input.sourceId);
    if (!input.title.trim()) throw new ValidationError("Document title is required.");

    const document = await this.documentRepository.create({ ...input, createdBy: ctx.userId, status: input.status ?? "draft" });
    await this.versionRepository.create({
      companyId: input.companyId,
      documentId: document.id,
      versionNumber: 1,
      checksum: input.checksum,
      mimeType: input.mimeType,
      metadata: input.metadata,
      createdBy: ctx.userId,
    });

    return document;
  }

  async updateDocument(ctx: ServiceContext, input: UpdateKnowledgeDocumentInput) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const document = await this.documentRepository.findById(input.documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(input.documentId);
    assertCompanyAccess(ctx, document.company_id);
    if (document.status !== "draft") {
      throw new DocumentLockedError(document.status);
    }
    return this.documentRepository.update(input);
  }

  async archiveDocument(ctx: ServiceContext, documentId: string) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    await this.documentRepository.update({ documentId, status: "archived" });
    return this.documentRepository.softDelete({ id: documentId, deletedBy: ctx.userId });
  }

  async getDocument(ctx: ServiceContext, documentId: string) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);
    return document;
  }

  async listDocuments(ctx: ServiceContext, filter: ListKnowledgeDocumentsFilter) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.documentRepository.list(filter);
  }
}
