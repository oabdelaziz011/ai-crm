import type { EnterpriseRuntimeExecuteInput, EnterpriseRuntimeExecuteResult } from "../types.js";

export type RuntimeMiddlewareContext = {
  input: EnterpriseRuntimeExecuteInput;
  result?: EnterpriseRuntimeExecuteResult;
};

export type RuntimeMiddleware = {
  name: string;
  order: number;
  handle: (ctx: RuntimeMiddlewareContext, next: () => Promise<void>) => Promise<void>;
};

export class RuntimeMiddlewarePipeline {
  constructor(private readonly middleware: RuntimeMiddleware[]) {}

  async run(ctx: RuntimeMiddlewareContext): Promise<void> {
    const ordered = [...this.middleware].sort((a, b) => a.order - b.order);
    let index = 0;

    const next = async (): Promise<void> => {
      const current = ordered[index];
      index += 1;
      if (!current) return;
      await current.handle(ctx, next);
    };

    await next();
  }
}

export class RuntimeMiddlewareRegistry {
  private readonly middleware = new Map<string, RuntimeMiddleware>();

  register(item: RuntimeMiddleware): this {
    this.middleware.set(item.name, item);
    return this;
  }

  createPipeline(): RuntimeMiddlewarePipeline {
    return new RuntimeMiddlewarePipeline([...this.middleware.values()]);
  }
}

export function createDefaultRuntimeMiddlewareRegistry(): RuntimeMiddlewareRegistry {
  const registry = new RuntimeMiddlewareRegistry();
  registry.register({
    name: "logging",
    order: 10,
    async handle(ctx, next) {
      await next();
      void ctx.result?.executionId;
    },
  });
  registry.register({
    name: "observability",
    order: 20,
    async handle(_ctx, next) {
      await next();
    },
  });
  return registry;
}
