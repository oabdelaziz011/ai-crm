import { DEFAULT_TEMPLATE_KEYS, PROMPT_PERMISSIONS } from "../constants.js";
import {
  ConversationBuilder,
  mergeBuilderSections,
  PolicyBuilder,
  ResponseContractBuilder,
  SystemPromptBuilder,
  ToolResultBuilder,
} from "../builders/prompt-builders.js";
import {
  PermissionDeniedError,
  PromptTemplateDisabledError,
  PromptTemplateNotFoundError,
  PromptTemplateVersionNotFoundError,
} from "../errors.js";
import type {
  PromptBuildRepository,
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "../repositories/prompt-repositories.js";
import {
  applyTemplateSectionOverrides,
  composeFinalPrompt,
  orderPromptSections,
} from "../utils/compose-prompt.js";
import type { PromptContextService } from "./prompt-context-service.js";
import type { BuildPromptInput, BuiltPrompt, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(PROMPT_PERMISSIONS.view);
  }
}

export class PromptOrchestratorService {
  private readonly builders = [
    new SystemPromptBuilder(),
    new ConversationBuilder(),
    new ToolResultBuilder(),
    new PolicyBuilder(),
  ];

  private readonly responseContractBuilder = new ResponseContractBuilder();

  constructor(
    private readonly templateRepository: PromptTemplateRepository,
    private readonly versionRepository: PromptTemplateVersionRepository,
    private readonly buildRepository: PromptBuildRepository,
    private readonly contextService: PromptContextService,
  ) {}

  async build(ctx: ServiceContext, input: BuildPromptInput): Promise<BuiltPrompt> {
    assertPermission(ctx, PROMPT_PERMISSIONS.view);
    assertCompanyAccess(ctx, input.companyId);

    const template = await this.resolveTemplate({
      ...input,
      templateType: input.templateType ?? "conversation",
    });
    if (!template.is_enabled) {
      throw new PromptTemplateDisabledError(template.key);
    }

    const version = await this.resolveActiveVersion(template);
    const normalizedContext = this.contextService.normalize({
      ...input.context,
      companyId: input.companyId,
      conversationId: input.conversationId ?? input.context.conversationId ?? null,
    });

    const dynamicSections = mergeBuilderSections(this.builders, normalizedContext);
    const mergedSections = applyTemplateSectionOverrides(dynamicSections, version);

    if (normalizedContext.formattingRules?.length) {
      mergedSections.formatting_rules = this.responseContractBuilder.buildFormattingSection(
        normalizedContext.formattingRules,
      );
    }

    const orderedSections = orderPromptSections(
      template.section_order,
      mergedSections,
      this.responseContractBuilder,
      version,
      normalizedContext.formattingRules,
    );

    const finalPrompt = composeFinalPrompt(orderedSections);
    const build = await this.buildRepository.create({
      companyId: input.companyId,
      conversationId: input.conversationId ?? null,
      templateId: template.id,
      templateVersionId: version.id,
      templateKey: template.key,
      templateType: template.template_type,
      sections: orderedSections,
      finalPrompt,
      outputContract: version.output_contract,
      createdBy: ctx.userId,
    });

    return {
      build_id: build.id,
      template_key: template.key,
      template_type: template.template_type,
      template_version_id: version.id,
      sections: orderedSections,
      final_prompt: finalPrompt,
      output_contract: version.output_contract,
    };
  }

  private async resolveTemplate(input: BuildPromptInput) {
    if (input.templateKey) {
      const template = await this.templateRepository.findByKey(input.companyId, input.templateKey);
      if (!template) throw new PromptTemplateNotFoundError(input.templateKey);
      return template;
    }

    if (input.templateType) {
      const template = await this.templateRepository.findByType(input.companyId, input.templateType);
      if (!template) {
        const fallbackKey = DEFAULT_TEMPLATE_KEYS[input.templateType];
        const fallback = await this.templateRepository.findByKey(input.companyId, fallbackKey);
        if (!fallback) throw new PromptTemplateNotFoundError(fallbackKey);
        return fallback;
      }
      return template;
    }

    throw new PromptTemplateNotFoundError("conversation_default");
  }

  private async resolveActiveVersion(template: { id: string; active_version_id: string | null }) {
    if (template.active_version_id) {
      const version = await this.versionRepository.findById(template.active_version_id);
      if (version) return version;
    }

    const active = await this.versionRepository.findActiveByTemplateId(template.id);
    if (!active) throw new PromptTemplateVersionNotFoundError(template.id);
    return active;
  }
}
