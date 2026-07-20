import { PROMPT_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, PromptTemplateNotFoundError } from "../errors.js";
import type {
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "../repositories/prompt-repositories.js";
import type { ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export class PromptRollbackService {
  constructor(
    private readonly templateRepository: PromptTemplateRepository,
    private readonly versionRepository: PromptTemplateVersionRepository,
  ) {}

  async rollback(ctx: ServiceContext, templateId: string, versionId: string) {
    assertPermission(ctx, PROMPT_PERMISSIONS.rollback);
    const template = await this.templateRepository.findById(templateId);
    if (!template) throw new PromptTemplateNotFoundError(templateId);

    const version = await this.versionRepository.findById(versionId);
    if (!version || version.template_id !== templateId) {
      throw new PromptTemplateNotFoundError(versionId);
    }

    const activated = await this.versionRepository.activate(templateId, versionId);
    await this.templateRepository.setActiveVersion(templateId, versionId);
    await this.templateRepository.setLifecycleState(templateId, {
      hasUnpublishedDraft: false,
    });
    return activated;
  }
}
