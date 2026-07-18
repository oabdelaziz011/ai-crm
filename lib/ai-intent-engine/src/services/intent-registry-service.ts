import { FALLBACK_INTENT_KEY, INTENT_PERMISSIONS } from "../constants.js";
import { IntentNotFoundError, PermissionDeniedError } from "../errors.js";
import type { IntentDefinitionRepository } from "../repositories/intent-repositories.js";
import type { IntentDefinitionRecord, ServiceContext, UpdateIntentDefinitionInput } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class IntentRegistryService {
  constructor(private readonly repository: IntentDefinitionRepository) {}

  async listIntents(ctx: ServiceContext, options?: { includeDisabled?: boolean }): Promise<IntentDefinitionRecord[]> {
    assertPermission(ctx, INTENT_PERMISSIONS.view);
    if (options?.includeDisabled) {
      return this.repository.listAll();
    }
    return this.repository.listEnabled();
  }

  async getIntentByKey(ctx: ServiceContext, key: string): Promise<IntentDefinitionRecord> {
    assertPermission(ctx, INTENT_PERMISSIONS.view);
    const intent = await this.repository.findByKey(key);
    if (!intent) throw new IntentNotFoundError(key);
    return intent;
  }

  async getIntentById(ctx: ServiceContext, id: string): Promise<IntentDefinitionRecord> {
    assertPermission(ctx, INTENT_PERMISSIONS.view);
    const intent = await this.repository.findById(id);
    if (!intent) throw new IntentNotFoundError(id);
    return intent;
  }

  async getFallbackIntent(ctx: ServiceContext): Promise<IntentDefinitionRecord> {
    return this.getIntentByKey(ctx, FALLBACK_INTENT_KEY);
  }

  async setIntentEnabled(ctx: ServiceContext, input: UpdateIntentDefinitionInput): Promise<IntentDefinitionRecord> {
    assertPermission(ctx, INTENT_PERMISSIONS.manage);
    const existing = await this.repository.findById(input.intentId);
    if (!existing) throw new IntentNotFoundError(input.intentId);
    return this.repository.updateEnabled(input);
  }
}
