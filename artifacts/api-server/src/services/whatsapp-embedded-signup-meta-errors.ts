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
