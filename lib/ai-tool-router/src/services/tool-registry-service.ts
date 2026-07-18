import { TOOL_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ToolNotFoundError } from "../errors.js";
import type { ToolDefinitionRepository } from "../repositories/tool-repositories.js";
import type { ServiceContext, ToolDefinitionRecord, UpdateToolDefinitionInput } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class ToolRegistryService {
  constructor(private readonly repository: ToolDefinitionRepository) {}

  async listTools(ctx: ServiceContext, options?: { includeDisabled?: boolean }): Promise<ToolDefinitionRecord[]> {
    assertPermission(ctx, TOOL_PERMISSIONS.view);
    if (options?.includeDisabled) {
      return this.repository.listAll();
    }
    return this.repository.listEnabled();
  }

  async getToolByKey(ctx: ServiceContext, key: string): Promise<ToolDefinitionRecord> {
    assertPermission(ctx, TOOL_PERMISSIONS.view);
    const tool = await this.repository.findByKey(key);
    if (!tool) throw new ToolNotFoundError(key);
    return tool;
  }

  async getToolById(ctx: ServiceContext, id: string): Promise<ToolDefinitionRecord> {
    assertPermission(ctx, TOOL_PERMISSIONS.view);
    const tool = await this.repository.findById(id);
    if (!tool) throw new ToolNotFoundError(id);
    return tool;
  }

  async setToolEnabled(ctx: ServiceContext, input: UpdateToolDefinitionInput): Promise<ToolDefinitionRecord> {
    assertPermission(ctx, TOOL_PERMISSIONS.manage);
    const existing = await this.repository.findById(input.toolId);
    if (!existing) throw new ToolNotFoundError(input.toolId);
    return this.repository.updateEnabled(input);
  }
}
