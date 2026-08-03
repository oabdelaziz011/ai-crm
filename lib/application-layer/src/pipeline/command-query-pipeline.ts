import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { CommandType, QueryType } from "../contracts/command-query-types.js";
import { validateCommand, validateQuery } from "../validation/command-validators.js";
import { assertAnyPermission } from "../validation/permission-validators.js";
import type { PipelineMiddleware } from "../middleware/pipeline-types.js";
import type { MutableMiddlewareContext } from "../middleware/default-middleware.js";
import { createDefaultMiddlewareStack } from "../middleware/default-middleware.js";
import type { AuditWriterPort } from "../ports/infrastructure-ports.js";
import type { IdempotencyPort } from "../ports/infrastructure-ports.js";

export type CommandPipelineOptions = {
  middleware?: PipelineMiddleware<unknown, unknown>[];
  audit?: AuditWriterPort;
  idempotency?: IdempotencyPort;
};

export type QueryPipelineOptions = {
  middleware?: PipelineMiddleware<unknown, unknown>[];
};

export class CommandPipeline {
  private readonly middleware: PipelineMiddleware<unknown, unknown>[];
  private readonly audit?: AuditWriterPort;
  private readonly idempotency?: IdempotencyPort;

  constructor(options: CommandPipelineOptions = {}) {
    this.middleware = options.middleware ?? createDefaultMiddlewareStack();
    this.audit = options.audit;
    this.idempotency = options.idempotency;
  }

  async execute<TRequest, TResponse>(input: {
    commandType: CommandType;
    request: TRequest;
    context: ApplicationContext;
    requiredPermissions: readonly string[];
    handler: (request: TRequest, context: ApplicationContext) => Promise<TResponse>;
    eventIds?: readonly string[];
  }): Promise<CommandResult<TResponse>> {
    const ctx: MutableMiddlewareContext<TRequest> = {
      request: input.request,
      applicationContext: input.context,
      commandOrQueryType: input.commandType,
      startedAt: Date.now(),
      logs: [],
    };

    const runHandler = async (): Promise<TResponse> => {
      validateCommand(input.commandType, input.request);
      ctx.logs.push({
        stage: "validation",
        commandOrQueryType: input.commandType,
        correlationId: input.context.correlationId,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });

      assertAnyPermission(input.context, input.requiredPermissions);
      ctx.logs.push({
        stage: "permission",
        commandOrQueryType: input.commandType,
        correlationId: input.context.correlationId,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });

      if (input.context.idempotencyKey && this.idempotency) {
        const exists = await this.idempotency.exists(input.context.tenantId, input.context.idempotencyKey);
        if (exists) {
          throw new Error(`Idempotent command already processed: ${input.context.idempotencyKey}`);
        }
      }

      const response = await input.handler(input.request, input.context);

      if (this.audit) {
        await this.audit.write({
          tenantId: input.context.tenantId,
          actorId: input.context.actorId,
          correlationId: input.context.correlationId,
          commandType: input.commandType,
          summary: `${input.commandType} executed`,
          occurredAt: new Date().toISOString(),
        });
        ctx.logs.push({
          stage: "audit",
          commandOrQueryType: input.commandType,
          correlationId: input.context.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        });
      }

      if (input.context.idempotencyKey && this.idempotency) {
        await this.idempotency.store(
          input.context.tenantId,
          input.context.idempotencyKey,
          JSON.stringify(response),
        );
      }

      return response;
    };

    let chain: () => Promise<TResponse> = runHandler;
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      const next = chain;
      chain = () => mw.execute(ctx as never, next as never) as Promise<TResponse>;
    }

    const data = await chain();

    return Object.freeze({
      data,
      correlationId: input.context.correlationId,
      eventIds: Object.freeze(input.eventIds ?? []),
    });
  }
}

export class QueryPipeline {
  private readonly middleware: PipelineMiddleware<unknown, unknown>[];

  constructor(options: QueryPipelineOptions = {}) {
    this.middleware = options.middleware ?? createDefaultMiddlewareStack();
  }

  async execute<TRequest, TResponse>(input: {
    queryType: QueryType;
    request: TRequest;
    context: ApplicationContext;
    requiredPermissions: readonly string[];
    handler: (request: TRequest, context: ApplicationContext) => Promise<TResponse>;
    cached?: boolean;
  }): Promise<QueryResult<TResponse>> {
    const ctx: MutableMiddlewareContext<TRequest> = {
      request: input.request,
      applicationContext: input.context,
      commandOrQueryType: input.queryType,
      startedAt: Date.now(),
      logs: [],
    };

    const runHandler = async (): Promise<TResponse> => {
      validateQuery(input.queryType, input.request);
      assertAnyPermission(input.context, input.requiredPermissions);
      return input.handler(input.request, input.context);
    };

    let chain: () => Promise<TResponse> = runHandler;
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      const next = chain;
      chain = () => mw.execute(ctx as never, next as never) as Promise<TResponse>;
    }

    const data = await chain();

    return Object.freeze({
      data,
      correlationId: input.context.correlationId,
      cached: input.cached ?? false,
    });
  }
}
