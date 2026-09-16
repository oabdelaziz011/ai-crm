export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; code: "password_invalid" | "password_mismatch" | "password_policy" };

/** Same policy as company-admin reset — never rely on React alone. */
export function validatePasswordPair(
  password: string,
  confirmPassword: string,
): PasswordPolicyResult {
  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { ok: false, code: "password_invalid" };
  }
  if (password !== confirmPassword) {
    return { ok: false, code: "password_mismatch" };
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false, code: "password_policy" };
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLower || !hasUpper || !hasDigit) {
    return { ok: false, code: "password_policy" };
  }
  return { ok: true };
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export const EMPLOYEE_RESET_REJECTION = {
  MISSING_PERMISSION: "missing_permission",
  CALLER_NO_COMPANY: "caller_missing_company",
  COMPANY_MISMATCH: "company_mismatch",
  TARGET_NOT_FOUND: "target_not_found",
  TARGET_NO_COMPANY: "target_no_company",
  TARGET_IS_SUPER_ADMIN: "target_is_super_admin",
  INVALID_TARGET: "invalid_target",
  INVALID_COMPANY: "invalid_company",
} as const;

export type EmployeeResetAuthInput = {
  callerIsSuperAdmin: boolean;
  callerCompanyId: string | null;
  hasManagePermission: boolean;
  requestedCompanyId: string | null;
  targetUserId: string | null;
  targetCompanyId: string | null;
  targetIsSuperAdmin: boolean;
  targetExists: boolean;
};

export type EmployeeResetAuthResult =
  | { ok: true; effectiveCompanyId: string }
  | { ok: false; reason: string };

export function authorizeEmployeePasswordReset(
  input: EmployeeResetAuthInput,
): EmployeeResetAuthResult {
  if (!input.callerIsSuperAdmin && !input.hasManagePermission) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.MISSING_PERMISSION };
  }
  if (!isUuid(input.targetUserId)) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.INVALID_TARGET };
  }
  if (!input.targetExists) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.TARGET_NOT_FOUND };
  }
  if (input.targetIsSuperAdmin && !input.callerIsSuperAdmin) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.TARGET_IS_SUPER_ADMIN };
  }
  if (!input.targetCompanyId) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.TARGET_NO_COMPANY };
  }

  if (input.callerIsSuperAdmin) {
    if (input.requestedCompanyId && input.requestedCompanyId !== input.targetCompanyId) {
      return { ok: false, reason: EMPLOYEE_RESET_REJECTION.COMPANY_MISMATCH };
    }
    return { ok: true, effectiveCompanyId: input.targetCompanyId };
  }

  if (!input.callerCompanyId) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.CALLER_NO_COMPANY };
  }
  if (input.targetCompanyId !== input.callerCompanyId) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.COMPANY_MISMATCH };
  }
  if (input.requestedCompanyId && input.requestedCompanyId !== input.callerCompanyId) {
    return { ok: false, reason: EMPLOYEE_RESET_REJECTION.COMPANY_MISMATCH };
  }
  return { ok: true, effectiveCompanyId: input.callerCompanyId };
}
