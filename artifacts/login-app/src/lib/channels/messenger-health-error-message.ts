/**
 * Map Meta / Graph health errors into operator-facing copy keys.
 * Keep remediation conservative — never invent Meta migration steps.
 */

export type MessengerHealthErrorPresentation = {
  /** i18n key under notifications.messenger.settings.* */
  descriptionKey?: string;
  fallbackDescription?: string;
};

export function resolveMessengerHealthErrorPresentation(
  error: string | null | undefined,
): MessengerHealthErrorPresentation {
  const text = String(error ?? "").trim();
  if (!text) return {};

  if (/session has expired|error validating access token/i.test(text)) {
    return { descriptionKey: "tokenExpired" };
  }
  if (/failed to fetch|cors|network/i.test(text)) {
    return { descriptionKey: "networkFailed" };
  }

  return { fallbackDescription: text };
}
