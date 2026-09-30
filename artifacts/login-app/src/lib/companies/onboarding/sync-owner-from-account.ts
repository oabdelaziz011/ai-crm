/**
 * Registration / onboarding phone helpers.
 * Account (user) phone and company contact phone are independent — never copy one into the other.
 */
import {
  resolvePhoneIdentity,
  type PhoneIdentityResult,
} from "@workspace/ai-tool-router";
import {
  validateCustomerPhoneFormInput,
  type CustomerPhoneValidation,
} from "@/lib/customers/customer-phone-form";

export const ONBOARDING_PHONE_DEFAULT_REGION = "EG";

export function resolveOnboardingPhoneE164(
  phone: string | null | undefined,
  region: string | null | undefined,
): string | null {
  const validation = validateCustomerPhoneFormInput({ phone, region });
  if (validation.code !== "ok") return null;
  return validation.preview.phoneE164;
}

export function validateOnboardingPhoneInput(input: {
  phone: string | null | undefined;
  region: string | null | undefined;
  required?: boolean;
}): CustomerPhoneValidation {
  const validation = validateCustomerPhoneFormInput(input);
  if (!input.required && validation.code === "empty") {
    return validation;
  }
  return validation;
}

/** Infer ISO region from a stored E.164 for form hydration (Back/Next / pending). */
export function regionFromStoredPhone(
  phone: string | null | undefined,
  fallback: string = ONBOARDING_PHONE_DEFAULT_REGION,
): string {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  if (!trimmed) return fallback;
  const resolved: PhoneIdentityResult = resolvePhoneIdentity({
    phone: trimmed,
    source: "explicit",
  });
  if (resolved.status === "resolved" && resolved.countryIso) {
    return resolved.countryIso;
  }
  return fallback;
}

/**
 * Map account draft → owner* fields only.
 * NEVER copies account phone into company contactPhone.
 */
export function syncOwnerFromAccount<
  T extends {
    ownerFirstName: string;
    ownerLastName: string;
    ownerDisplayName: string;
    ownerEmail: string;
    ownerPhone: string;
    ownerPhoneRegion: string;
    ownerJobTitle: string;
    contactEmail: string;
    contactPhone: string;
    contactPhoneRegion: string;
  },
>(
  values: T,
  account: {
    fullName: string;
    email: string;
    phone: string;
    phoneRegion: string;
    jobTitle: string;
  },
  splitFullName: (fullName: string) => { first: string; last: string },
  buildOwnerDisplayName: (first: string, last: string, fallback?: string) => string,
): T {
  const { first, last } = splitFullName(account.fullName);
  const displayName =
    values.ownerDisplayName.trim() ||
    account.fullName.trim() ||
    buildOwnerDisplayName(first, last, account.email);

  return {
    ...values,
    ownerFirstName: first,
    ownerLastName: last,
    ownerDisplayName: displayName,
    ownerEmail: account.email.trim(),
    // Account phone → owner phone only (never company contactPhone).
    ownerPhone: account.phone.trim() || values.ownerPhone.trim(),
    ownerPhoneRegion:
      (account.phoneRegion || "").trim().toUpperCase() ||
      values.ownerPhoneRegion ||
      ONBOARDING_PHONE_DEFAULT_REGION,
    ownerJobTitle: account.jobTitle.trim() || "Owner",
    // Company contact email may prefill from account email (email only — not phone).
    contactEmail: values.contactEmail.trim() || account.email.trim(),
    // contactPhone / contactPhoneRegion intentionally untouched.
  };
}
