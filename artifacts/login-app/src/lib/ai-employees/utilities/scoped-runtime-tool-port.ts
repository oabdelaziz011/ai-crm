import type {
  RuntimeToolPort,
  RuntimeToolRouteInput,
  RuntimeToolRouteResult,
  ServiceContext,
} from "@workspace/ai-execution-engine";
import {
  evaluateToolScope,
  stampToolScopeDecision,
} from "./tool-scope-filter.js";
import { resolveActiveToolScope } from "./tool-scope-context.js";

function readLlmToolName(tool: unknown): string | null {
  if (!tool || typeof tool !== "object") return null;
  const candidate = tool as { function?: { name?: unknown } };
  return typeof candidate.function?.name === "string" ? candidate.function.name : null;
}

export function createScopedRuntimeToolPort(basePort: RuntimeToolPort): RuntimeToolPort {
  return {
    allowedToolKeys() {
      const scope = resolveActiveToolScope();
      if (!scope) return basePort.allowedToolKeys();

      const globallyAllowed = new Set(basePort.allowedToolKeys());
      return scope.allowedToolKeys.filter((toolKey) => globallyAllowed.has(toolKey));
    },

    listLlmTools() {
      const scope = resolveActiveToolScope();
      if (!scope) return basePort.listLlmTools();

      const scopedKeys = new Set(this.allowedToolKeys());
      return basePort.listLlmTools().filter((tool) => {
        const toolName = readLlmToolName(tool);
        return toolName != null && scopedKeys.has(toolName);
      });
    },

    async route(
      ctx: ServiceContext,
      input: RuntimeToolRouteInput,
    ): Promise<RuntimeToolRouteResult> {
      return applyToolScopeBeforeRoute(basePort, ctx, input);
    },
  };
}

export async function applyToolScopeBeforeRoute(
  route: Pick<RuntimeToolPort, "route">,
  ctx: ServiceContext,
  input: RuntimeToolRouteInput,
): Promise<RuntimeToolRouteResult> {
  const scope = resolveActiveToolScope(input.conversationId);
  const evaluation = evaluateToolScope({
    toolKey: input.toolKey,
    allowedToolKeys: scope?.allowedToolKeys,
    employeeId: scope?.employeeId,
  });

  stampToolScopeDecision(evaluation, input.toolKey);

  if (evaluation.decision === "deny") {
    return {
      executionId: `scope-denied-${Date.now()}`,
      toolKey: input.toolKey,
      status: "failed",
      output: evaluation.denial,
      durationMs: 0,
      errorCode: evaluation.denial.errorCode,
      errorMessage: evaluation.reason,
    };
  }

  return route.route(ctx, input);
}
