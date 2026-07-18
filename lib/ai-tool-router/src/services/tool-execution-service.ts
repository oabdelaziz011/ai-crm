import { TOOL_PERMISSIONS } from "../constants.js";
import {
  ConversationAccessDeniedError,
  PermissionDeniedError,
  ToolExecutionNotFoundError,
} from "../errors.js";
import type { ToolExecutionRepository } from "../repositories/tool-repositories.js";
import type { ListToolExecutionsFilter, ServiceContext, ToolExecutionRecord } from "../types.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new ConversationAccessDeniedError();
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class ToolExecutionService {
  constructor(private readonly repository: ToolExecutionRepository) {}

  async getExecution(ctx: ServiceContext, executionId: string): Promise<ToolExecutionRecord> {
    assertPermission(ctx, TOOL_PERMISSIONS.view);
    const execution = await this.repository.findById(executionId);
    if (!execution) throw new ToolExecutionNotFoundError(executionId);
    assertCompanyAccess(ctx, execution.company_id);
    return execution;
  }

  async listExecutions(
    ctx: ServiceContext,
    filter: ListToolExecutionsFilter,
  ): Promise<ToolExecutionRecord[]> {
    assertPermission(ctx, TOOL_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.repository.list(filter);
  }
}
