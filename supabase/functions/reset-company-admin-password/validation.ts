export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; code: "password_invalid" | "password_mismatch" | "password_policy" };

/** Server-side password policy (never rely on React alone). */
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
