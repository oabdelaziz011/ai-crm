import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeSectionNotFoundError,
  KnowledgeVersionNotFoundError,
  ValidationError,
} from "../errors.js";
import type { KnowledgeSectionRepository, KnowledgeVersionRepository } from "../repositories/knowledge-repositories.js";
import type {
  CreateKnowledgeSectionInput,
  KnowledgeSectionRecord,
  ListKnowledgeSectionsFilter,
  ServiceContext,
  UpdateKnowledgeSectionInput,
} from "../types.js";
import {
  assertCompanyAccess,
  assertKnowledgeFeatureEnabled,
  assertPermission,
} from "../utils/knowledge-guards.js";

export type SectionTreeNode = KnowledgeSectionRecord & { children: SectionTreeNode[] };

export class KnowledgeSectionService {
  constructor(
    private readonly sectionRepository: KnowledgeSectionRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
  ) {}

  async createSection(ctx: ServiceContext, input: CreateKnowledgeSectionInput) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const version = await this.versionRepository.findById(input.versionId);
    if (!version || version.document_id !== input.documentId) throw new KnowledgeVersionNotFoundError(input.versionId);
    if (!input.title.trim()) throw new ValidationError("Section title is required.");

    return this.sectionRepository.create(input);
  }

  async updateSection(ctx: ServiceContext, input: UpdateKnowledgeSectionInput) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const section = await this.sectionRepository.findById(input.sectionId);
    if (!section) throw new KnowledgeSectionNotFoundError(input.sectionId);
    assertCompanyAccess(ctx, section.company_id);
    return this.sectionRepository.update(input);
  }

  async reorderSection(ctx: ServiceContext, sectionId: string, sectionOrder: number) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const section = await this.sectionRepository.findById(sectionId);
    if (!section) throw new KnowledgeSectionNotFoundError(sectionId);
    assertCompanyAccess(ctx, section.company_id);
    return this.sectionRepository.reorder({ sectionId, sectionOrder });
  }

  async archiveSection(ctx: ServiceContext, sectionId: string) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.manage);
    const section = await this.sectionRepository.findById(sectionId);
    if (!section) throw new KnowledgeSectionNotFoundError(sectionId);
    assertCompanyAccess(ctx, section.company_id);
    return this.sectionRepository.softDelete({ id: sectionId, deletedBy: ctx.userId });
  }

  async listSections(ctx: ServiceContext, filter: ListKnowledgeSectionsFilter) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.sectionRepository.list(filter);
  }

  async listSectionHierarchy(ctx: ServiceContext, filter: ListKnowledgeSectionsFilter): Promise<SectionTreeNode[]> {
    const sections = await this.listSections(ctx, filter);
    const nodes = new Map<string, SectionTreeNode>();
    const roots: SectionTreeNode[] = [];

    for (const section of sections) {
      nodes.set(section.id, { ...section, children: [] });
    }

    for (const section of sections) {
      const node = nodes.get(section.id)!;
      if (section.parent_section_id && nodes.has(section.parent_section_id)) {
        nodes.get(section.parent_section_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortTree = (items: SectionTreeNode[]) => {
      items.sort((a, b) => a.section_order - b.section_order);
      for (const item of items) sortTree(item.children);
    };
    sortTree(roots);
    return roots;
  }
}
