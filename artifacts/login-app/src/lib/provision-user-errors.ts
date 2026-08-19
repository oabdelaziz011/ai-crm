import type { TFunction } from "i18next";
import i18n from "@/i18n";
import { translateAuthError, translateAuthErrorMessage, type AuthErrorLike } from "@/lib/auth-errors";
import { isUserSeatLimitError } from "@/lib/billing/company-resource-limits";

type FunctionInvokeError = {
  message?: string | null;
  name?: string | null;
  context?: { status?: number | null };
};

export function isProvisionUserUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as FunctionInvokeError;
  const message = (err.message ?? "").toLowerCase();
  const status = err.context?.status ?? null;

  if (status === 404) {
    return true;
  }

  return (
    err.name === "FunctionsFetchError" ||
    message.includes("failed to send a request to the edge function") ||
    message.includes("requested function was not found") ||
    message.includes("function not found") ||
    (message.includes("edge function") && message.includes("not found"))
  );
}

function provisionPayloadLooksLikeSeatLimit(
  invokeError: unknown,
  response: { error?: unknown; code?: unknown } | null | undefined,
): boolean {
  const responseText = `${String(response?.error ?? "")} ${String(response?.code ?? "")}`;
  if (isUserSeatLimitError(responseText)) return true;
  if (
    invokeError &&
    typeof invokeError === "object" &&
    "message" in invokeError &&
    isUserSeatLimitError(String((invokeError as AuthErrorLike).message ?? ""))
  ) {
    return true;
  }
  return false;
}

export function translateProvisionUserError(
  invokeError: unknown,
  response: { error?: unknown; code?: unknown } | null | undefined,
  t: TFunction<"common">,
): string {
  if (isProvisionUserUnavailable(invokeError)) {
    return t("users.errors.provisionServiceUnavailable");
  }

  if (provisionPayloadLooksLikeSeatLimit(invokeError, response)) {
    return t("users.errors.seatLimitReached");
  }

  if (invokeError) {
    const message =
      typeof invokeError === "object" && invokeError !== null && "message" in invokeError
        ? String((invokeError as AuthErrorLike).message ?? "")
        : String(invokeError);
    return translateAuthError(message, t);
  }

  if (response?.error) {
    return translateAuthError(String(response.error), t);
  }

  return t("users.errors.provisionFailed");
}

export function translateProvisionUserErrorMessage(
  invokeError: unknown,
  response: { error?: unknown; code?: unknown } | null | undefined,
): string {
  if (isProvisionUserUnavailable(invokeError)) {
    return i18n.t("users.errors.provisionServiceUnavailable", { ns: "common" });
  }

  if (provisionPayloadLooksLikeSeatLimit(invokeError, response)) {
    return i18n.t("users.errors.seatLimitReached", { ns: "common" });
  }

  if (invokeError) {
    const message =
      typeof invokeError === "object" && invokeError !== null && "message" in invokeError
        ? String((invokeError as AuthErrorLike).message ?? "")
        : String(invokeError);
    return translateAuthErrorMessage(message);
  }

  if (response?.error) {
    return translateAuthErrorMessage(String(response.error));
  }

  return i18n.t("users.errors.provisionFailed", { ns: "common" });
}
