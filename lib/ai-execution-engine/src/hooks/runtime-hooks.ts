import type { EnterpriseRuntimeExecuteInput, EnterpriseRuntimeExecuteResult } from "../types.js";

export type RuntimeHookName =
  | "beforeContextBuild"
  | "afterContextBuild"
  | "beforePromptRender"
  | "afterPromptRender"
  | "beforeGateway"
  | "afterGateway"
  | "onError";

export type RuntimeHookContext = {
  input: EnterpriseRuntimeExecuteInput;
  result?: Partial<EnterpriseRuntimeExecuteResult>;
  error?: Error;
};

export type RuntimeHookHandler = (ctx: RuntimeHookContext) => void | Promise<void>;

export class RuntimeHookRegistry {
  private readonly hooks = new Map<RuntimeHookName, RuntimeHookHandler[]>();

  register(name: RuntimeHookName, handler: RuntimeHookHandler): this {
    const existing = this.hooks.get(name) ?? [];
    existing.push(handler);
    this.hooks.set(name, existing);
    return this;
  }

  async emit(name: RuntimeHookName, ctx: RuntimeHookContext): Promise<void> {
    const handlers = this.hooks.get(name) ?? [];
    for (const handler of handlers) {
      await handler(ctx);
    }
  }
}

export function createDefaultRuntimeHookRegistry(): RuntimeHookRegistry {
  return new RuntimeHookRegistry();
}
