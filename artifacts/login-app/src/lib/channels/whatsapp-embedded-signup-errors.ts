/**
 * Resolve Embedded Signup API / Meta error codes to i18n keys + safe fallback text.
 * Keep remediation conservative — never invent Meta migration steps.
 */

export type EmbeddedSignupErrorPresentation = {
  /** i18n key under notifications.whatsapp.settings.embeddedSignup.* */
  titleKey: string;
  descriptionKey?: string;
  /** When descriptionKey is absent, use this raw Meta/API message. */
  fallbackDescription?: string;
};

const CODE_TO_DESCRIPTION: Record<string, string> = {
  ES_DISABLED: "serverDisabled",
  ES_COMPANY_NOT_ALLOWED: "companyNotAllowed",
  ES_META_CONFIG_MISSING: "metaConfigMissing",
  ES_META_CONFIG_ID_MISSING: "metaConfigMissing",
  ES_COEXISTENCE_DISABLED: "coexistenceDisabledHint",
  ES_CONNECTION_EXISTS: "existingConnection",
  ES_META_NUMBER_ALREADY_CLOUD_API: "metaNumberAlreadyCloudApi",
  ES_META_ALREADY_SHARED_WITH_PARTNER: "metaAlreadySharedWithPartner",
  ES_META_NUMBER_OTHER_BUSINESS_PORTFOLIO: "metaNumberOtherBusinessPortfolio",
  ES_META_NUMBER_OTHER_WABA_SAME_PORTFOLIO: "metaNumberOtherWabaSamePortfolio",
  ES_REGISTER_PIN_MISSING: "registerPinMissing",
  ES_REGISTER_FAILED: "registerFailed",
  ES_WEBHOOK_SUBSCRIBE_FAILED: "webhookSubscribeFailed",
  ES_STATE_INVALID: "stateInvalid",
  ES_STATE_EXPIRED: "stateExpired",
  ES_STATE_COMPANY_MISMATCH: "stateInvalid",
  ES_STATE_MODE_MISMATCH: "stateInvalid",
  ES_CODE_EXCHANGE_FAILED: "codeExchangeFailed",
  ES_PHONE_IN_USE: "phoneInUse",
  ES_INVALID_REQUEST: "invalidRequest",
};

export function resolveEmbeddedSignupErrorPresentation(input: {
  code?: string | null;
  message?: string | null;
  metaErrorCode?: number | null;
}): EmbeddedSignupErrorPresentation {
  const code = String(input.code ?? "").trim();
  const metaErrorCode =
    typeof input.metaErrorCode === "number" && Number.isFinite(input.metaErrorCode)
      ? input.metaErrorCode
      : null;

  // Prefer explicit Meta numeric codes when the API code is generic.
  if (metaErrorCode === 2655122 || code === "ES_META_NUMBER_ALREADY_CLOUD_API") {
    return {
      titleKey: "failed",
      descriptionKey: "metaNumberAlreadyCloudApi",
    };
  }
  if (metaErrorCode === 2655093 || code === "ES_META_ALREADY_SHARED_WITH_PARTNER") {
    return {
      titleKey: "failed",
      descriptionKey: "metaAlreadySharedWithPartner",
    };
  }
  if (
    metaErrorCode === 3441067 ||
    metaErrorCode === 3441103 ||
    metaErrorCode === 3441041 ||
    metaErrorCode === 3441062 ||
    metaErrorCode === 2655127 ||
    code === "ES_META_NUMBER_OTHER_BUSINESS_PORTFOLIO"
  ) {
    return {
      titleKey: "failed",
      descriptionKey: "metaNumberOtherBusinessPortfolio",
    };
  }
  if (metaErrorCode === 3441090 || code === "ES_META_NUMBER_OTHER_WABA_SAME_PORTFOLIO") {
    return {
      titleKey: "failed",
      descriptionKey: "metaNumberOtherWabaSamePortfolio",
    };
  }

  if (code === "ES_CONNECTION_EXISTS") {
    return {
      titleKey: "existingConnection",
      descriptionKey: "existingConnection",
    };
  }

  const descriptionKey = CODE_TO_DESCRIPTION[code];
  if (descriptionKey) {
    return {
      titleKey: "failed",
      descriptionKey,
    };
  }

  return {
    titleKey: "failed",
    fallbackDescription: String(input.message ?? "").trim() || undefined,
  };
}
