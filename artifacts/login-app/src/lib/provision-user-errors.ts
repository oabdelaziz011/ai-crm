import type { TFunction } from "i18next";
import i18n from "@/i18n";
import { translateAuthError, translateAuthErrorMessage, type AuthErrorLike } from "@/lib/auth-errors";
import { isUserSeatLimitError } from "@/lib/billing/company-resource-limits";

type FunctionInvokeError = {
  message?: string | null;
  name?: string | null;
  context?: Response | { status?: number | null; json?: () => Promise<unknown> } | null;
};

export type ProvisionUserErrorPayload = {
  error?: unknown;
  code?: unknown;
} | null | undefined;

export function isProvisionUserUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as FunctionInvokeError;
  const message = (err.message ?? "").toLowerCase();
  const status =
    err.context && typeof err.context === "object" && "status" in err.context
      ? (err.context.status ?? null)
      : null;

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

/**
 * Supabase functions.invoke sets `error` on non-2xx and may omit/empty `data`.
 * The real payload is often on `error.context` (Fetch Response).
 */
export async function readProvisionUserErrorPayload(
  invokeError: unknown,
  response: ProvisionUserErrorPayload,
): Promise<ProvisionUserErrorPayload> {
  if (response && (response.error != null || response.code != null)) {
    return response;
  }

  if (!invokeError || typeof invokeError !== "object") {
    return response ?? null;
  }

  const context = (invokeError as FunctionInvokeError).context;
  if (!context || typeof context !== "object") {
    return response ?? null;
  }

  try {
    if (typeof (context as Response).clone === "function") {
      const cloned = (context as Response).clone();
      const json = (await cloned.json()) as ProvisionUserErrorPayload;
      if (json && typeof json === "object") return json;
    } else if (typeof (context as { json?: () => Promise<unknown> }).json === "function") {
      const json = (await (context as { json: () => Promise<unknown> }).json()) as ProvisionUserErrorPayload;
      if (json && typeof json === "object") return json;
    }
  } catch {
    /* body already consumed or not JSON */
  }

  return response ?? null;
}

function provisionPayloadLooksLikeSeatLimit(
  invokeError: unknown,
  response: ProvisionUserErrorPayload,
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

function translateFromPayload(
  response: ProvisionUserErrorPayload,
  translate: (error: AuthErrorLike | string) => string,
): string | null {
  if (!response) return null;

  const code = response.code != null ? String(response.code) : "";
  const errorText = response.error != null ? String(response.error) : "";

  if (code || errorText) {
    return translate({ message: errorText || code, code });
  }

  return null;
}

export function translateProvisionUserError(
  invokeError: unknown,
  response: ProvisionUserErrorPayload,
  t: TFunction<"common">,
): string {
  if (isProvisionUserUnavailable(invokeError)) {
    return t("users.errors.provisionServiceUnavailable");
  }

  if (provisionPayloadLooksLikeSeatLimit(invokeError, response)) {
    return t("users.errors.seatLimitReached");
  }

  // Prefer Edge Function JSON body over generic "non-2xx" invoke errors.
  const fromPayload = translateFromPayload(response, (error) => translateAuthError(error, t));
  if (fromPayload) return fromPayload;

  if (invokeError) {
    const message =
      typeof invokeError === "object" && invokeError !== null && "message" in invokeError
        ? String((invokeError as AuthErrorLike).message ?? "")
        : String(invokeError);
    // Generic functions.invoke wrapper — fall back to provisionFailed, not "Something went wrong".
    if (message.toLowerCase().includes("non-2xx") || message.toLowerCase().includes("edge function")) {
      return t("users.errors.provisionFailed");
    }
    return translateAuthError(message, t);
  }

  return t("users.errors.provisionFailed");
}

export function translateProvisionUserErrorMessage(
  invokeError: unknown,
  response: ProvisionUserErrorPayload,
): string {
  if (isProvisionUserUnavailable(invokeError)) {
    return i18n.t("users.errors.provisionServiceUnavailable", { ns: "common" });
  }

  if (provisionPayloadLooksLikeSeatLimit(invokeError, response)) {
    return i18n.t("users.errors.seatLimitReached", { ns: "common" });
  }

  const fromPayload = translateFromPayload(response, translateAuthErrorMessage);
  if (fromPayload) return fromPayload;

  if (invokeError) {
    const message =
      typeof invokeError === "object" && invokeError !== null && "message" in invokeError
        ? String((invokeError as AuthErrorLike).message ?? "")
        : String(invokeError);
    if (message.toLowerCase().includes("non-2xx") || message.toLowerCase().includes("edge function")) {
      return i18n.t("users.errors.provisionFailed", { ns: "common" });
    }
    return translateAuthErrorMessage(message);
  }

  return i18n.t("users.errors.provisionFailed", { ns: "common" });
}
