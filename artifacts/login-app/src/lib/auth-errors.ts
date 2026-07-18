import type { TFunction } from "i18next";
import i18n from "@/i18n";

export type AuthErrorKey =
  | "invalidEmail"
  | "emailAlreadyExists"
  | "invalidCredentials"
  | "weakPassword"
  | "emailNotConfirmed"
  | "expiredLink"
  | "invalidResetLink"
  | "networkError"
  | "rateLimitExceeded"
  | "unknownServerError";

export type AuthErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
  name?: string | null;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveAuthErrorKey(
  error: AuthErrorLike | string | null | undefined,
): AuthErrorKey {
  if (!error) {
    return "unknownServerError";
  }

  const message = typeof error === "string" ? error : error.message ?? "";
  const code = typeof error === "string" ? "" : error.code ?? "";
  const normalizedMessage = normalize(message);
  const normalizedCode = normalize(code);

  if (
    normalizedCode === "over_email_send_rate_limit" ||
    normalizedCode === "over_request_rate_limit" ||
    normalizedCode === "over_sms_send_rate_limit" ||
    normalizedMessage.includes("rate limit")
  ) {
    return "rateLimitExceeded";
  }

  if (
    normalizedCode === "invalid_credentials" ||
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return "invalidCredentials";
  }

  if (
    normalizedCode === "email_exists" ||
    normalizedCode === "user_already_exists" ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("user already exists") ||
    normalizedMessage.includes("already been registered")
  ) {
    return "emailAlreadyExists";
  }

  if (
    (normalizedCode === "validation_failed" && normalizedMessage.includes("email")) ||
    normalizedMessage.includes("invalid email") ||
    normalizedMessage.includes("unable to validate email") ||
    normalizedMessage.includes("valid email address")
  ) {
    return "invalidEmail";
  }

  if (
    normalizedCode === "email_not_confirmed" ||
    normalizedMessage.includes("email not confirmed")
  ) {
    return "emailNotConfirmed";
  }

  if (
    normalizedCode === "weak_password" ||
    (normalizedMessage.includes("password") &&
      (normalizedMessage.includes("weak") ||
        normalizedMessage.includes("at least") ||
        normalizedMessage.includes("characters") ||
        normalizedMessage.includes("should be")))
  ) {
    return "weakPassword";
  }

  if (
    normalizedCode === "otp_expired" ||
    normalizedMessage.includes("flow state has expired") ||
    normalizedMessage.includes("token has expired") ||
    normalizedMessage.includes("link has expired") ||
    normalizedMessage.includes("expired")
  ) {
    return "expiredLink";
  }

  if (
    normalizedMessage.includes("invalid") &&
    (normalizedMessage.includes("recovery") ||
      normalizedMessage.includes("reset") ||
      normalizedMessage.includes("otp") ||
      normalizedMessage.includes("link") ||
      normalizedMessage.includes("token") ||
      normalizedMessage.includes("session"))
  ) {
    return "invalidResetLink";
  }

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network error") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network request failed")
  ) {
    return "networkError";
  }

  return "unknownServerError";
}

export function translateAuthError(
  error: AuthErrorLike | string | null | undefined,
  t: TFunction<"common">,
): string {
  const key = resolveAuthErrorKey(error);
  return t(`auth.errors.${key}`);
}

export function translateAuthErrorMessage(
  error: AuthErrorLike | string | null | undefined,
): string {
  const key = resolveAuthErrorKey(error);
  return i18n.t(`auth.errors.${key}`, { ns: "common" });
}
