export const TOOL_NOT_ALLOWED_CODE = "TOOL_NOT_ALLOWED" as const;
export const EMPLOYEE_TOOL_SCOPE_DENIED_CODE = "EMPLOYEE_TOOL_SCOPE_DENIED" as const;

export type RuntimeToolDenialCode =
  | typeof TOOL_NOT_ALLOWED_CODE
  | typeof EMPLOYEE_TOOL_SCOPE_DENIED_CODE;

export type RuntimeToolDenial = {
  success: false;
  errorCode: RuntimeToolDenialCode;
  toolKey: string;
  reason: string;
  timestamp: string;
  employeeId?: string;
};

/** Backward-compatible denial shape for legacy tool-loop consumers. */
export type LegacyCompatibleRuntimeToolDenial = RuntimeToolDenial & {
  message: string;
};

export type RuntimeToolFailurePayload = {
  success: false;
  errorCode: string;
  reason: string;
  message: string;
};

export function createRuntimeToolDenial(input: {
  errorCode: RuntimeToolDenialCode;
  toolKey: string;
  reason: string;
  employeeId?: string;
  timestamp?: string;
}): RuntimeToolDenial {
  return {
    success: false,
    errorCode: input.errorCode,
    toolKey: input.toolKey,
    reason: input.reason,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
  };
}

export function createToolNotAllowedDenial(input: {
  toolKey: string;
  reason?: string;
  timestamp?: string;
}): RuntimeToolDenial {
  return createRuntimeToolDenial({
    errorCode: TOOL_NOT_ALLOWED_CODE,
    toolKey: input.toolKey,
    reason: input.reason ?? `Tool ${input.toolKey} is not enabled.`,
    timestamp: input.timestamp,
  });
}

export function createEmployeeToolScopeDenial(input: {
  toolKey: string;
  reason: string;
  employeeId: string;
  timestamp?: string;
}): RuntimeToolDenial {
  return createRuntimeToolDenial({
    errorCode: EMPLOYEE_TOOL_SCOPE_DENIED_CODE,
    toolKey: input.toolKey,
    reason: input.reason,
    employeeId: input.employeeId,
    timestamp: input.timestamp,
  });
}

export function toLegacyCompatibleDenial(denial: RuntimeToolDenial): LegacyCompatibleRuntimeToolDenial {
  return {
    ...denial,
    message: denial.reason,
  };
}

export function serializeRuntimeToolDenial(denial: RuntimeToolDenial): string {
  return JSON.stringify(toLegacyCompatibleDenial(denial));
}

export function readRuntimeToolDenialReason(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;
  if (typeof payload.reason === "string" && payload.reason.length > 0) return payload.reason;
  if (typeof payload.message === "string" && payload.message.length > 0) return payload.message;
  return null;
}

export function createToolExecutionFailurePayload(input: {
  errorCode: string;
  reason: string;
}): RuntimeToolFailurePayload {
  return {
    success: false,
    errorCode: input.errorCode,
    reason: input.reason,
    message: input.reason,
  };
}
