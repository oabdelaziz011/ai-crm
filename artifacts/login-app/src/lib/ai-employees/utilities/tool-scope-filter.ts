import {
  createEmployeeToolScopeDenial as createSharedEmployeeToolScopeDenial,
  EMPLOYEE_TOOL_SCOPE_DENIED_CODE,
  toLegacyCompatibleDenial,
  type RuntimeToolDenial,
} from "@workspace/ai-execution-engine";
import { isTestRuntime } from "@workspace/platform-crypto/client";

export { EMPLOYEE_TOOL_SCOPE_DENIED_CODE };

export type EmployeeToolScopeDenial = RuntimeToolDenial & {
  errorCode: typeof EMPLOYEE_TOOL_SCOPE_DENIED_CODE;
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
  reason: string;
  employeeId: string;
  timestamp?: string;
}): EmployeeToolScopeDenial {
  return toLegacyCompatibleDenial(
    createSharedEmployeeToolScopeDenial(input),
  ) as EmployeeToolScopeDenial;
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

  const reason = `Tool ${input.toolKey} is not permitted for AI Employee ${input.employeeId}.`;
  return {
    decision: "deny",
    employeeId: input.employeeId,
    reason,
    denial: createEmployeeToolScopeDenial({
      toolKey: input.toolKey,
      reason,
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
  });
}
