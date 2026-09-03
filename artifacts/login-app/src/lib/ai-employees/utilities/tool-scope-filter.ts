import {
  createEmployeeToolScopeDenial as createSharedEmployeeToolScopeDenial,
  EMPLOYEE_TOOL_SCOPE_DENIED_CODE,
  toLegacyCompatibleDenial,
  type RuntimeToolDenial,
} from "@workspace/ai-execution-engine";
import { isTestRuntime } from "@workspace/platform-crypto/client";
import {
  AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE,
  type AiEmployeeCommercialDenialReason,
} from "./ai-employee-commercial-runtime-gate.js";

export { EMPLOYEE_TOOL_SCOPE_DENIED_CODE };

/** Phase 2 assignment denial reason (structured). Legacy code remains for older harnesses. */
export const TOOL_NOT_ASSIGNED_CODE = "TOOL_NOT_ASSIGNED" as const;

/**
 * Assignment denials use TOOL_NOT_ASSIGNED (Phase 2 / login-app taxonomy).
 * Shared runtime denials use EMPLOYEE_TOOL_SCOPE_DENIED; this shape remaps at the boundary.
 */
export type EmployeeToolScopeDenial = Omit<RuntimeToolDenial, "errorCode"> & {
  errorCode: typeof TOOL_NOT_ASSIGNED_CODE | typeof EMPLOYEE_TOOL_SCOPE_DENIED_CODE;
  denialReason: typeof TOOL_NOT_ASSIGNED_CODE;
  employeeId: string;
  message: string;
};

export type ToolScopeDecision = "allow" | "deny" | "pass-through";

export type ToolScopeEvaluation =
  | { decision: "pass-through" }
  | { decision: "allow"; employeeId: string }
  | {
      decision: "deny";
      employeeId: string;
      reason: string;
      denial: EmployeeToolScopeDenial;
    };

export function createEmployeeToolScopeDenial(input: {
  toolKey: string;
  reason?: string;
  employeeId: string;
  timestamp?: string;
}): EmployeeToolScopeDenial {
  const safeReason = AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE;
  const base = toLegacyCompatibleDenial(
    createSharedEmployeeToolScopeDenial({
      toolKey: input.toolKey,
      reason: safeReason,
      employeeId: input.employeeId,
      timestamp: input.timestamp,
    }),
  );
  return {
    ...base,
    errorCode: TOOL_NOT_ASSIGNED_CODE,
    denialReason: TOOL_NOT_ASSIGNED_CODE,
    employeeId: input.employeeId,
    message: safeReason,
    reason: safeReason,
  };
}

export function evaluateToolScope(input: {
  toolKey: string;
  allowedToolKeys: readonly string[] | null | undefined;
  employeeId: string | null | undefined;
}): ToolScopeEvaluation {
  if (!input.employeeId || !input.allowedToolKeys) {
    return { decision: "pass-through" };
  }

  if (input.allowedToolKeys.includes(input.toolKey)) {
    return { decision: "allow", employeeId: input.employeeId };
  }

  return {
    decision: "deny",
    employeeId: input.employeeId,
    reason: AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE,
    denial: createEmployeeToolScopeDenial({
      toolKey: input.toolKey,
      employeeId: input.employeeId,
    }),
  };
}

export function logToolScopeDecision(input: {
  employeeId: string | null;
  toolKey: string;
  allowed: boolean;
  denied: boolean;
  decision: ToolScopeDecision;
  reason?: string;
  denialReason?: AiEmployeeCommercialDenialReason | typeof TOOL_NOT_ASSIGNED_CODE;
}): void {
  if (isTestRuntime()) return;

  console.info(
    JSON.stringify({
      event: "ai_employee_tool_scope",
      employeeId: input.employeeId,
      toolKey: input.toolKey,
      allowed: input.allowed,
      denied: input.denied,
      decision: input.decision,
      reason: input.reason ?? null,
      denialReason: input.denialReason ?? null,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function stampToolScopeDecision(
  evaluation: ToolScopeEvaluation,
  toolKey: string,
): void {
  if (evaluation.decision === "pass-through") {
    logToolScopeDecision({
      employeeId: null,
      toolKey,
      allowed: false,
      denied: false,
      decision: "pass-through",
    });
    return;
  }

  if (evaluation.decision === "allow") {
    logToolScopeDecision({
      employeeId: evaluation.employeeId,
      toolKey,
      allowed: true,
      denied: false,
      decision: "allow",
    });
    return;
  }

  logToolScopeDecision({
    employeeId: evaluation.employeeId,
    toolKey,
    allowed: false,
    denied: true,
    decision: "deny",
    reason: evaluation.reason,
    denialReason: TOOL_NOT_ASSIGNED_CODE,
  });
}
