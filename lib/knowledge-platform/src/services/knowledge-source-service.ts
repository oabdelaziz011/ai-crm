import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  DuplicateKnowledgeSourceError,
  KnowledgeSourceNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { KnowledgeSourceRepository } from "../repositories/knowledge-repositories.js";
import type { CreateKnowledgeSourceInput, ListKnowledgeSourcesFilter, ServiceContext, UpdateKnowledgeSourceInput } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(KNOWLEDGE_PERMISSIONS.view);
}

export class KnowledgeSourceService {
  constructor(private readonly sourceRepository: KnowledgeSourceRepository) {}

  async createSource(ctx: ServiceContext, input: CreateKnowledgeSourceInput) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    if (!input.key.trim()) throw new ValidationError("Source key is required.");
    const existing = await this.sourceRepository.findByKey(input.companyId, input.key);
    if (existing) throw new DuplicateKnowledgeSourceError(input.key);
    return this.sourceRepository.create({ ...input, createdBy: ctx.userId });
  }

  async updateSource(ctx: ServiceContext, input: UpdateKnowledgeSourceInput) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const source = await this.sourceRepository.findById(input.sourceId);
    if (!source) throw new KnowledgeSourceNotFoundError(input.sourceId);
    assertCompanyAccess(ctx, source.company_id);
    return this.sourceRepository.update(input);
  }

  async archiveSource(ctx: ServiceContext, sourceId: string) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const source = await this.sourceRepository.findById(sourceId);
    if (!source) throw new KnowledgeSourceNotFoundError(sourceId);
    assertCompanyAccess(ctx, source.company_id);
    return this.sourceRepository.softDelete({ id: sourceId, deletedBy: ctx.userId });
  }

  async getSource(ctx: ServiceContext, sourceId: string) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    const source = await this.sourceRepository.findById(sourceId);
    if (!source) throw new KnowledgeSourceNotFoundError(sourceId);
    assertCompanyAccess(ctx, source.company_id);
    return source;
  }

  async listSources(ctx: ServiceContext, filter: ListKnowledgeSourcesFilter) {
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.sourceRepository.list(filter);
  }
}

/** @deprecated Use KnowledgeSourceService */
export class KnowledgeRegistryService extends KnowledgeSourceService {}
