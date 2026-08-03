import type { PipelineMiddleware } from "./pipeline-types.js";
import type { ApplicationContext } from "../contracts/application-context.js";

export const loggingMiddleware: PipelineMiddleware<unknown, unknown> = {
  name: "logging",
  async execute(ctx, next) {
    const start = Date.now();
    try {
      return await next();
    } finally {
      ctx.logs.push({
        stage: "execution",
        commandOrQueryType: ctx.commandOrQueryType,
        correlationId: ctx.applicationContext.correlationId,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      });
    }
  },
};

export const correlationMiddleware: PipelineMiddleware<unknown, unknown> = {
  name: "correlation",
  async execute(ctx, next) {
    if (!ctx.applicationContext.correlationId) {
      throw new Error("correlationId is required");
    }
    return next();
  },
};

export const tenantContextMiddleware: PipelineMiddleware<unknown, unknown> = {
  name: "tenant",
  async execute(ctx, next) {
    if (!ctx.applicationContext.tenantId) {
      throw new Error("tenantId is required");
    }
    ctx.logs.push({
      stage: "tenant",
      commandOrQueryType: ctx.commandOrQueryType,
      correlationId: ctx.applicationContext.correlationId,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });
    return next();
  },
};

export const localizationMiddleware: PipelineMiddleware<unknown, unknown> = {
  name: "localization",
  async execute(_ctx, next) {
    return next();
  },
};

export const featureFlagMiddleware = (
  flag: string,
): PipelineMiddleware<unknown, unknown> => ({
  name: `feature:${flag}`,
  async execute(ctx, next) {
    if (ctx.applicationContext.featureFlags[flag] === false) {
      throw new Error(`Feature flag disabled: ${flag}`);
    }
    return next();
  },
});

export function createDefaultMiddlewareStack(): PipelineMiddleware<unknown, unknown>[] {
  return [
    correlationMiddleware,
    tenantContextMiddleware,
    loggingMiddleware,
    localizationMiddleware,
  ];
}

export type MutableMiddlewareContext<TRequest> = {
  request: TRequest;
  applicationContext: ApplicationContext;
  commandOrQueryType: string;
  startedAt: number;
  logs: Array<{
    stage: import("./pipeline-types.js").PipelineStage;
    commandOrQueryType: string;
    correlationId: string;
    durationMs: number;
    timestamp: string;
  }>;
};
