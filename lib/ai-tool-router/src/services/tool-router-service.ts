import { findMissingAlignedPermission } from "@workspace/agent-runtime";
import { TOOL_PERMISSIONS } from "../constants.js";
import {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  PermissionDeniedError,
  TenantContextMissingError,
  ToolDisabledError,
  ToolHandlerNotFoundError,
  ToolNotFoundError,
  ToolRouterError,
  ToolStateNotSupportedError,
} from "../errors.js";
import type { ConversationReader } from "../ports/conversation-reader.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "../repositories/tool-repositories.js";
import type { ToolHandlerRegistry } from "../tools/tool-contract.js";
import type { RouteToolInput, ServiceContext, ToolRouteResult } from "../types.js";
import { sleep, supportsConversationState, validateAgainstSchema, withTimeout } from "../utils/tool-utils.js";
import { logToolEvent } from "../utils/tool-logger.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function findMissingPermission(
  ctx: ServiceContext,
  permissions: string[],
  toolKey?: string,
): string | null {
  return findMissingAlignedPermission(ctx, permissions, toolKey);
}

function assertTenantContext(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId?.trim() || !ctx.userId?.trim()) {
    throw new TenantContextMissingError();
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new ConversationAccessDeniedError();
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof ToolRouterError && error.code === "TOOL_TIMEOUT";
}

export class ToolRouterService {
  constructor(
    private readonly definitionRepository: ToolDefinitionRepository,
    private readonly executionRepository: ToolExecutionRepository,
    private readonly conversationReader: ConversationReader,
    private readonly handlers: ToolHandlerRegistry,
  ) {}

  async route(ctx: ServiceContext, input: RouteToolInput): Promise<ToolRouteResult> {
    assertTenantContext(ctx);
    assertPermission(ctx, TOOL_PERMISSIONS.execute);

    const conversation = await this.conversationReader.findById(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }
    assertCompanyAccess(ctx, conversation.company_id);

    const definition = await this.definitionRepository.findByKey(input.toolKey);
    if (!definition) {
      throw new ToolNotFoundError(input.toolKey);
    }
    if (!definition.is_enabled) {
      throw new ToolDisabledError(input.toolKey);
    }

    const handler = this.handlers.get(input.toolKey);
    if (!handler) {
      throw new ToolHandlerNotFoundError(input.toolKey);
    }

    if (
      !supportsConversationState(definition.supported_states, conversation.state) ||
      !handler.supports(conversation.state)
    ) {
      throw new ToolStateNotSupportedError(input.toolKey, conversation.state);
    }

    validateAgainstSchema(definition.input_schema, input.input);
    handler.validate(input.input);

    logToolEvent({
      event: "tool_selected",
      conversationId: conversation.id,
      companyId: conversation.company_id,
      toolKey: definition.key,
      triggeredBy: input.triggeredBy ?? "router",
      input: input.input,
    });

    const missingPermission = findMissingPermission(ctx, definition.required_permissions, definition.key);
    const startedAt = Date.now();
    const execution = await this.executionRepository.create({
      companyId: conversation.company_id,
      conversationId: conversation.id,
      toolDefinitionId: definition.id,
      toolKey: definition.key,
      input: input.input,
      triggeredBy: input.triggeredBy ?? "router",
      createdBy: ctx.userId,
    });

    if (missingPermission) {
      const durationMs = Date.now() - startedAt;
      const completed = await this.executionRepository.complete({
        executionId: execution.id,
        status: "denied",
        output: null,
        errorCode: "PERMISSION_DENIED",
        errorMessage: `Missing required permission: ${missingPermission}`,
        durationMs,
      });

      return {
        executionId: completed.id,
        toolKey: completed.tool_key,
        status: completed.status,
        output: null,
        durationMs: completed.duration_ms ?? durationMs,
        errorCode: completed.error_code,
        errorMessage: completed.error_message,
      };
    }

    await this.executionRepository.markRunning(execution.id);

    const executionContext = {
      companyId: conversation.company_id,
      conversationId: conversation.id,
      conversationState: conversation.state,
      userId: ctx.userId,
      trustedCustomerId: conversation.customer_id,
    };

    const maxAttempts = Math.max(1, definition.retry_policy.maxAttempts);
    const backoffMs = Math.max(0, definition.retry_policy.backoffMs);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const output = await withTimeout(
          handler.execute(executionContext, input.input),
          definition.timeout_ms,
          () => new ToolRouterError("TOOL_TIMEOUT", `Tool ${definition.key} timed out after ${definition.timeout_ms}ms.`),
        );

        const durationMs = Date.now() - startedAt;
        const completed = await this.executionRepository.complete({
          executionId: execution.id,
          status: "succeeded",
          output,
          durationMs,
        });

        logToolEvent({
          event: "tool_execution_completed",
          conversationId: conversation.id,
          companyId: conversation.company_id,
          toolKey: completed.tool_key,
          executionId: completed.id,
          triggeredBy: input.triggeredBy ?? "router",
          input: input.input,
          output: completed.output,
          durationMs: completed.duration_ms ?? durationMs,
          status: completed.status,
        });

        return {
          executionId: completed.id,
          toolKey: completed.tool_key,
          status: completed.status,
          output: completed.output,
          durationMs: completed.duration_ms ?? durationMs,
          errorCode: null,
          errorMessage: null,
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && !isTimeoutError(error)) {
          await sleep(backoffMs);
          continue;
        }
        break;
      }
    }

    const durationMs = Date.now() - startedAt;
    const isTimeout = isTimeoutError(lastError);
    const isDenied = lastError instanceof PermissionDeniedError;

    const status = isTimeout ? "timeout" : isDenied ? "denied" : "failed";
    const errorCode =
      lastError instanceof ToolRouterError
        ? lastError.code
        : isTimeout
          ? "TOOL_TIMEOUT"
          : "TOOL_EXECUTION_FAILED";
    const errorMessage =
      lastError instanceof Error ? lastError.message : "Tool execution failed.";

    const completed = await this.executionRepository.complete({
      executionId: execution.id,
      status,
      output: null,
      errorCode,
      errorMessage,
      durationMs,
    });

    logToolEvent({
      event: "tool_execution_failed",
      conversationId: conversation.id,
      companyId: conversation.company_id,
      toolKey: completed.tool_key,
      executionId: completed.id,
      triggeredBy: input.triggeredBy ?? "router",
      input: input.input,
      durationMs: completed.duration_ms ?? durationMs,
      status: completed.status,
      errorCode: completed.error_code,
      errorMessage: completed.error_message,
    });

    return {
      executionId: completed.id,
      toolKey: completed.tool_key,
      status: completed.status,
      output: null,
      durationMs: completed.duration_ms ?? durationMs,
      errorCode: completed.error_code,
      errorMessage: completed.error_message,
    };
  }
}
