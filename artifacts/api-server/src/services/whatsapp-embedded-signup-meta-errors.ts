/**
 * Map Meta Graph / Embedded Signup error payloads to stable ValueOR codes.
 *
 * Only document meanings that are corroborated by Meta community reports /
 * partner troubleshooting for the same numeric code. Do not invent remediation.
 */

export type MetaEmbeddedSignupErrorInfo = {
  /** Stable ValueOR error code for clients / i18n. */
  code: string;
  /** Safe operator-facing message (no secrets). */
  message: string;
  /** Meta numeric error code when present. */
  metaErrorCode: number | null;
  /** Meta error subcode when present. */
  metaErrorSubcode: number | null;
};

type GraphErrorLike = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
};

/**
 * Meta #2655122 — phone number is already registered on WhatsApp Cloud API
 * (dedicated API number), so Coexistence / Business App pairing is rejected.
 * Sources: Meta developer community threads; partner Coexistence troubleshooting.
 * ValueOR must not auto-delete WABAs or invent a migration path.
 */
export const META_ERROR_NUMBER_ALREADY_CLOUD_API = 2655122;

/** Partner credit-line / already-shared with another solution provider (related family). */
export const META_ERROR_ALREADY_SHARED_WITH_PARTNER = 2655093;

/**
 * Meta #3441067 — number sits on a WABA in a Business Portfolio the user does not manage.
 * Source: Meta Embedded Signup Flow Errors (phone setup).
 */
export const META_ERROR_NUMBER_OTHER_BUSINESS_PORTFOLIO = 3441067;

/**
 * Meta #3441103 — number belongs to a different Business Portfolio than the one selected.
 * Source: Meta Embedded Signup Flow Errors (WhatsApp Business app user onboarding).
 */
export const META_ERROR_NUMBER_DIFFERENT_PORTFOLIO_SELECTED = 3441103;

/**
 * Meta #3441090 — number is already on another WABA inside the same Business Portfolio.
 * Source: Meta Embedded Signup Flow Errors (phone setup).
 */
export const META_ERROR_NUMBER_OTHER_WABA_SAME_PORTFOLIO = 3441090;

/** Older / related “not associated with the business you selected” family. */
export const META_ERROR_NUMBER_NOT_ASSOCIATED_WITH_BUSINESS_A = 3441041;
export const META_ERROR_NUMBER_NOT_ASSOCIATED_WITH_BUSINESS_B = 3441062;
export const META_ERROR_NUMBER_NOT_LINKED_TO_SELECTED_BUSINESS = 2655127;

const OTHER_PORTFOLIO_CODES = new Set([
  META_ERROR_NUMBER_OTHER_BUSINESS_PORTFOLIO,
  META_ERROR_NUMBER_DIFFERENT_PORTFOLIO_SELECTED,
  META_ERROR_NUMBER_NOT_ASSOCIATED_WITH_BUSINESS_A,
  META_ERROR_NUMBER_NOT_ASSOCIATED_WITH_BUSINESS_B,
  META_ERROR_NUMBER_NOT_LINKED_TO_SELECTED_BUSINESS,
]);

function looksLikeOtherBusinessPortfolioMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /business portfolio|محفظة أعمال|محفظه اعمال|business manager|حساب أعمال آخر|حساب اعمال اخر/i.test(
      text,
    ) &&
    /another|different|don't manage|do not manage|لا تدير|غير|أخرى|اخري|تاني|ثاني/i.test(text)
  );
}

export function extractMetaGraphError(payload: unknown): GraphErrorLike | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const nested = root.error;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as GraphErrorLike;
  }
  if (typeof root.code === "number" || typeof root.message === "string") {
    return root as GraphErrorLike;
  }
  return null;
}

export function mapMetaEmbeddedSignupGraphError(
  payload: unknown,
  fallbackMessage = "Meta Embedded Signup request failed.",
): MetaEmbeddedSignupErrorInfo {
  const graph = extractMetaGraphError(payload);
  const metaErrorCode =
    typeof graph?.code === "number" && Number.isFinite(graph.code) ? graph.code : null;
  const metaErrorSubcode =
    typeof graph?.error_subcode === "number" && Number.isFinite(graph.error_subcode)
      ? graph.error_subcode
      : null;
  const rawMessage =
    String(graph?.error_user_msg ?? graph?.message ?? "").trim() || fallbackMessage;

  if (metaErrorCode === META_ERROR_NUMBER_ALREADY_CLOUD_API) {
    return {
      code: "ES_META_NUMBER_ALREADY_CLOUD_API",
      message:
        "Meta error 2655122: this phone number is already registered on WhatsApp Cloud API, so it cannot be paired with the WhatsApp Business App (Coexistence) in its current state. Use Cloud API Embedded Signup for a Cloud API number, or contact Meta/support before changing an existing registration. ValueOR does not delete or migrate Meta assets automatically.",
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  if (metaErrorCode === META_ERROR_ALREADY_SHARED_WITH_PARTNER) {
    return {
      code: "ES_META_ALREADY_SHARED_WITH_PARTNER",
      message:
        "Meta error 2655093: this WhatsApp Business Account or number appears already associated with another partner or credit line. ValueOR cannot release that association. Ask the current partner/Meta administrator to resolve ownership before retrying.",
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  if (metaErrorCode === META_ERROR_NUMBER_OTHER_WABA_SAME_PORTFOLIO) {
    return {
      code: "ES_META_NUMBER_OTHER_WABA_SAME_PORTFOLIO",
      message:
        "Meta error 3441090: this phone number is already on another WhatsApp Business Account in the same Meta Business Portfolio. In WhatsApp Manager, remove the number from that other WABA (or pick that WABA), then retry Embedded Signup. ValueOR does not delete Meta assets automatically.",
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  if (metaErrorCode != null && OTHER_PORTFOLIO_CODES.has(metaErrorCode)) {
    return {
      code: "ES_META_NUMBER_OTHER_BUSINESS_PORTFOLIO",
      message: `Meta error ${metaErrorCode}: this phone number is already linked to a WhatsApp Business Account in another Meta Business Portfolio (or a portfolio different from the one you selected). Go back in Meta’s signup and select the portfolio that owns the number, or ask an admin of that portfolio to grant you access / release the number. ValueOR cannot move Meta portfolio ownership.`,
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  if (looksLikeOtherBusinessPortfolioMessage(rawMessage)) {
    return {
      code: "ES_META_NUMBER_OTHER_BUSINESS_PORTFOLIO",
      message:
        "This phone number appears linked to another Meta Business Portfolio. In Meta Embedded Signup, select the portfolio that already owns the number, or ask that portfolio’s admin to grant access / release it. ValueOR cannot move Meta portfolio ownership.",
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  if (metaErrorCode != null) {
    return {
      code: "ES_META_GRAPH_ERROR",
      message: `Meta error ${metaErrorCode}${metaErrorSubcode != null ? `/${metaErrorSubcode}` : ""}: ${rawMessage}`,
      metaErrorCode,
      metaErrorSubcode,
    };
  }

  return {
    code: "ES_META_GRAPH_ERROR",
    message: rawMessage,
    metaErrorCode: null,
    metaErrorSubcode: null,
  };
}

/**
 * Parse optional Meta WA_EMBEDDED_SIGNUP postMessage error fields from the browser.
 * Only maps known numeric codes; unknown payloads stay generic.
 */
export function mapMetaEmbeddedSignupSessionEvent(input: {
  event?: string | null;
  errorCode?: number | string | null;
  errorMessage?: string | null;
}): MetaEmbeddedSignupErrorInfo | null {
  const rawCode = input.errorCode;
  const numeric =
    typeof rawCode === "number"
      ? rawCode
      : typeof rawCode === "string" && /^\d+$/.test(rawCode.trim())
        ? Number(rawCode.trim())
        : null;

  if (numeric == null && !String(input.errorMessage ?? "").trim()) {
    return null;
  }

  return mapMetaEmbeddedSignupGraphError(
    {
      error: {
        code: numeric ?? undefined,
        message: String(input.errorMessage ?? "").trim() || undefined,
      },
    },
    "Meta Embedded Signup reported an error.",
  );
}
