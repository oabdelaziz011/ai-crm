import { DEFAULT_TEMPLATE_KEYS, PROMPT_PERMISSIONS } from "../constants.js";
import {
  PermissionDeniedError,
  PromptTemplateNotFoundError,
} from "../errors.js";
import type {
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "../repositories/prompt-repositories.js";
import type {
  CreatePromptTemplateInput,
  CreatePromptTemplateVersionInput,
  ListPromptTemplatesFilter,
  PromptTemplateRecord,
  PromptTemplateVersionRecord,
  ServiceContext,
} from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string | null): void {
  if (ctx.isSuperAdmin) return;
  if (companyId && ctx.companyId !== companyId) {
    throw new PermissionDeniedError(PROMPT_PERMISSIONS.view);
  }
}

export class PromptTemplateService {
  constructor(
    private readonly templateRepository: PromptTemplateRepository,
    private readonly versionRepository: PromptTemplateVersionRepository,
  ) {}

  async listTemplates(ctx: ServiceContext, filter: ListPromptTemplatesFilter): Promise<PromptTemplateRecord[]> {
    assertPermission(ctx, PROMPT_PERMISSIONS.view);
    if (filter.companyId) assertCompanyAccess(ctx, filter.companyId);
    return this.templateRepository.list({ includeSystem: true, ...filter });
  }

  async getTemplate(ctx: ServiceContext, companyId: string, key: string): Promise<PromptTemplateRecord> {
    assertPermission(ctx, PROMPT_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    const template = await this.templateRepository.findByKey(companyId, key);
    if (!template) throw new PromptTemplateNotFoundError(key);
    return template;
  }

  async getTemplateVersions(
    ctx: ServiceContext,
    templateId: string,
  ): Promise<PromptTemplateVersionRecord[]> {
    assertPermission(ctx, PROMPT_PERMISSIONS.view);
    const template = await this.templateRepository.findById(templateId);
    if (!template) throw new PromptTemplateNotFoundError(templateId);
    assertCompanyAccess(ctx, template.company_id);
    return this.versionRepository.listByTemplateId(templateId);
  }

  async createTemplate(
    ctx: ServiceContext,
    input: CreatePromptTemplateInput,
  ): Promise<PromptTemplateRecord> {
    assertPermission(ctx, PROMPT_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    return this.templateRepository.create(input);
  }

  async createTemplateVersion(
    ctx: ServiceContext,
    input: CreatePromptTemplateVersionInput,
  ): Promise<PromptTemplateVersionRecord> {
    assertPermission(ctx, PROMPT_PERMISSIONS.manage);
    const template = await this.templateRepository.findById(input.templateId);
    if (!template) throw new PromptTemplateNotFoundError(input.templateId);
    assertCompanyAccess(ctx, template.company_id);
    return this.versionRepository.create({ ...input, createdBy: ctx.userId });
  }

  async activateTemplateVersion(
    ctx: ServiceContext,
    templateId: string,
    versionId: string,
  ): Promise<PromptTemplateVersionRecord> {
    assertPermission(ctx, PROMPT_PERMISSIONS.manage);
    const template = await this.templateRepository.findById(templateId);
    if (!template) throw new PromptTemplateNotFoundError(templateId);
    assertCompanyAccess(ctx, template.company_id);
    const version = await this.versionRepository.activate(templateId, versionId);
    await this.templateRepository.setActiveVersion(templateId, versionId);
    return version;
  }

  async setTemplateEnabled(
    ctx: ServiceContext,
    templateId: string,
    isEnabled: boolean,
  ): Promise<PromptTemplateRecord> {
    assertPermission(ctx, PROMPT_PERMISSIONS.manage);
    const template = await this.templateRepository.findById(templateId);
    if (!template) throw new PromptTemplateNotFoundError(templateId);
    assertCompanyAccess(ctx, template.company_id);
    return this.templateRepository.updateEnabled(templateId, isEnabled);
  }

  resolveDefaultTemplateKey(templateType: keyof typeof DEFAULT_TEMPLATE_KEYS): string {
    return DEFAULT_TEMPLATE_KEYS[templateType];
  }
}
