export type PasswordStrengthLevel = "empty" | "weak" | "medium" | "strong";

export type PasswordStrength = {
  level: PasswordStrengthLevel;
  /** 0–3 fill segments for the meter bar */
  score: 0 | 1 | 2 | 3;
};

/**
 * Lightweight client-side strength for UX feedback only.
 * Server/auth still enforces the project password policy.
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { level: "empty", score: 0 };

  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (length < 6) {
    return { level: "weak", score: 1 };
  }

  if (length >= 8 && variety >= 3) {
    return { level: "strong", score: 3 };
  }

  if (length >= 6 && variety >= 2) {
    return { level: "medium", score: 2 };
  }

  return { level: "weak", score: 1 };
}
