import { PROMPT_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, PromptTemplateNotFoundError, ValidationError } from "../errors.js";
import type {
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "../repositories/prompt-repositories.js";
import type { CreatePromptTemplateVersionInput, ServiceContext } from "../types.js";
import { hasBlockingPublishIssues, validatePromptVersionForPublish } from "./publish-validation.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export class PromptPublishService {
  constructor(
    private readonly templateRepository: PromptTemplateRepository,
    private readonly versionRepository: PromptTemplateVersionRepository,
  ) {}

  async publishDraft(
    ctx: ServiceContext,
    input: CreatePromptTemplateVersionInput & { knownVariables?: string[] },
  ) {
    assertPermission(ctx, PROMPT_PERMISSIONS.publish);
    const template = await this.templateRepository.findById(input.templateId);
    if (!template) throw new PromptTemplateNotFoundError(input.templateId);

    const draftVersion: CreatePromptTemplateVersionInput = {
      ...input,
      activate: false,
      createdBy: ctx.userId,
    };
    const created = await this.versionRepository.create({
      ...draftVersion,
      lifecycleStatus: "draft",
    });

    const issues = validatePromptVersionForPublish(
      { ...created, is_active: false },
      { knownVariables: input.knownVariables },
    );
    if (hasBlockingPublishIssues(issues)) {
      throw new ValidationError(issues.map((issue) => issue.message).join(" "));
    }

    const published = await this.versionRepository.activate(input.templateId, created.id);
    await this.templateRepository.setActiveVersion(input.templateId, created.id);
    await this.templateRepository.setLifecycleState(input.templateId, {
      hasUnpublishedDraft: false,
    });
    return { version: published, validationIssues: issues.filter((issue) => issue.severity === "warning") };
  }
}
