import type { RuntimeContextProvider, RuntimeContextSource } from "./context-providers.js";

/**
 * Maps unified ContextAssemblyService output into runtime prompt context.
 * Replaces duplicated customer360 / entity context builders when assembledContext is present.
 */
export class AssembledContextProvider implements RuntimeContextProvider {
  readonly key = "assembled";

  resolve(source: RuntimeContextSource) {
    const assembled = source.assembledContext as Record<string, unknown> | undefined;
    const memory = source.memorySnapshot as Record<string, unknown> | undefined;
    if (!assembled && !memory) return {};

    return Object.freeze({
      assembled: assembled ?? {},
      memory: memory ?? {},
      customer: assembled?.customer ?? undefined,
      customer360: assembled?.customer360 ?? undefined,
      lead: assembled?.lead ?? undefined,
      booking: assembled?.booking ?? undefined,
      invoice: assembled?.invoice ?? undefined,
      workspace: assembled?.workspace ?? undefined,
      company: assembled?.company ?? undefined,
      employee: assembled?.employee ?? undefined,
      featureFlags: assembled?.featureFlags ?? undefined,
      licensing: assembled?.licensing ?? undefined,
      configuration: assembled?.configuration ?? undefined,
      knowledge: assembled?.knowledge ?? undefined,
      realtime: assembled?.realtime ?? undefined,
    });
  }
}
