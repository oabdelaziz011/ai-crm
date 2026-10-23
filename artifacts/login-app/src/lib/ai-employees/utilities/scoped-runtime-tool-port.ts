import type {
  RuntimeToolPort,
  RuntimeToolRouteInput,
  RuntimeToolRouteResult,
  ServiceContext,
} from "@workspace/ai-execution-engine";
import {
  createCommercialToolDenialPayload,
  evaluateCommercialToolAccess,
  type AiEmployeeCommercialEntitlementPort,
} from "./ai-employee-commercial-runtime-gate.js";
import { applyProductPriceVisibility } from "@workspace/ai-tool-router";
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

export type ScopedRuntimeToolPortOptions = {
  /**
   * Required for AI Employee scoped execution.
   * Commercial entitlement is independent of RBAC / isSuperAdmin.
   */
  commercialEntitlement: AiEmployeeCommercialEntitlementPort;
};

export function createScopedRuntimeToolPort(
  basePort: RuntimeToolPort,
  options: ScopedRuntimeToolPortOptions,
): RuntimeToolPort {
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
      return applyToolScopeBeforeRoute(basePort, ctx, input, options);
    },
  };
}

export async function applyToolScopeBeforeRoute(
  route: Pick<RuntimeToolPort, "route">,
  ctx: ServiceContext,
  input: RuntimeToolRouteInput,
  options?: ScopedRuntimeToolPortOptions,
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

  // Non-AI-Employee surface: assignment scope inactive → do not apply commercial AI gate.
  if (evaluation.decision === "pass-through") {
    return applyEmployeeProductPricePolicy(scope, input.toolKey, await route.route(ctx, input));
  }

  // AI Employee surface: commercial entitlement ∩ assignment ∩ trusted tenant context.
  // Never trust companyId from LLM tool arguments — use ServiceContext only.
  const commercial = options?.commercialEntitlement;
  if (!commercial) {
    const denial = createCommercialToolDenialPayload({
      toolKey: input.toolKey,
      denialReason: "FEATURE_NOT_ENTITLED",
      employeeId: evaluation.employeeId,
    });
    return {
      executionId: `commercial-denied-${Date.now()}`,
      toolKey: input.toolKey,
      status: "failed",
      output: denial,
      durationMs: 0,
      errorCode: denial.errorCode,
      errorMessage: denial.reason,
    };
  }

  const access = await evaluateCommercialToolAccess({
    toolKey: input.toolKey,
    companyId: ctx.companyId,
    isFeatureEnabled: commercial.isFeatureEnabled,
    isSuperAdmin: ctx.isSuperAdmin,
  });

  if (!access.allowed) {
    const denial = createCommercialToolDenialPayload({
      toolKey: input.toolKey,
      denialReason: access.denialReason,
      employeeId: evaluation.employeeId,
    });
    return {
      executionId: `commercial-denied-${Date.now()}`,
      toolKey: input.toolKey,
      status: "failed",
      output: denial,
      durationMs: 0,
      errorCode: denial.errorCode,
      errorMessage: denial.reason,
    };
  }

  return applyEmployeeProductPricePolicy(scope, input.toolKey, await route.route(ctx, input));
}

const PRODUCT_LOOKUP_TOOL_KEYS = new Set(["search_products", "get_product_details"]);

function applyEmployeeProductPricePolicy(
  scope: ReturnType<typeof resolveActiveToolScope>,
  toolKey: string,
  result: RuntimeToolRouteResult,
): RuntimeToolRouteResult {
  if (!PRODUCT_LOOKUP_TOOL_KEYS.has(toolKey)) return result;
  if (!result.output || typeof result.output !== "object") return result;
  return {
    ...result,
    output: applyProductPriceVisibility(
      result.output,
      scope?.showProductPrices === true,
    ),
  };
}
