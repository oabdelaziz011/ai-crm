import type { PluginExecutionResult, PluginRuntimeContext } from "@/lib/plugins/types";
import { hasPluginPermission } from "@/lib/plugins/permissions/permission-resolver";

export type SandboxHandler = (ctx: PluginRuntimeContext, input: Record<string, unknown>) => Promise<unknown>;

/** Isolated plugin execution — no direct Supabase access. */
export class PluginSandbox {
  private readonly handlers = new Map<string, SandboxHandler>();

  register(pluginId: string, handler: SandboxHandler): void {
    this.handlers.set(pluginId, handler);
  }

  unregister(pluginId: string): void {
    this.handlers.delete(pluginId);
  }

  async execute(
    ctx: PluginRuntimeContext,
    input: Record<string, unknown>,
    requiredPermission?: Parameters<typeof hasPluginPermission>[1],
  ): Promise<PluginExecutionResult> {
    const start = performance.now();

    if (requiredPermission && !hasPluginPermission(ctx.permissions, requiredPermission)) {
      return { success: false, error: `Permission denied: ${requiredPermission}`, executionMs: 0 };
    }

    const handler = this.handlers.get(ctx.pluginId);
    if (!handler) {
      return { success: false, error: `No handler registered for ${ctx.pluginId}`, executionMs: 0 };
    }

    try {
      const output = await Promise.race([
        handler(ctx, input),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Plugin timeout (5s)")), 5000)),
      ]);
      return { success: true, output, executionMs: Math.round(performance.now() - start) };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        executionMs: Math.round(performance.now() - start),
      };
    }
  }
}

export const pluginSandbox = new PluginSandbox();

// Register built-in official plugin handlers (stub implementations)
pluginSandbox.register("valueor.booking-insights", async (ctx) => ({
  widget: { title: "Booking Insights", data: { companyId: ctx.companyId, type: "booking-insights" } },
}));

pluginSandbox.register("valueor.revenue-summary", async (ctx) => ({
  widget: { title: "Revenue Summary", data: { companyId: ctx.companyId, type: "revenue-summary" } },
}));

pluginSandbox.register("valueor.customer-timeline", async (ctx) => ({
  extension: { point: "crm.customer.profile", companyId: ctx.companyId },
}));

pluginSandbox.register("valueor.branch-health", async (ctx) => ({
  widget: { title: "Branch Health", data: { companyId: ctx.companyId, type: "branch-health" } },
}));

pluginSandbox.register("valueor.communication-digest", async (ctx) => ({
  widget: { title: "Communication Digest", data: { companyId: ctx.companyId, type: "communication-digest" } },
}));
