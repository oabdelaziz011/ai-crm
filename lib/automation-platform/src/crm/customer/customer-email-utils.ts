const DUPLICATE_EMAIL_CONSTRAINT_MARKERS = [
  "idx_customers_company_email_unique",
  "idx_customer_user_email",
  "customers_company_email_unique",
] as const;

const DUPLICATE_PHONE_E164_CONSTRAINT_MARKERS = [
  "idx_customers_company_phone_e164_unique",
  "customers_company_phone_e164_unique",
  "phone_e164",
] as const;

const DUPLICATE_PHONE_CONSTRAINT_MARKERS = [
  "idx_customers_company_phone_unique",
  "customers_company_phone_unique",
] as const;

export function normalizeCustomerEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
}

export function isDuplicateCustomerEmailError(error: unknown): boolean {
  const normalized = errorMessage(error).toLowerCase();
  return DUPLICATE_EMAIL_CONSTRAINT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export function isDuplicateCustomerPhoneE164Error(error: unknown): boolean {
  const normalized = errorMessage(error).toLowerCase();
  if (!normalized.includes("unique") && !normalized.includes("duplicate")) return false;
  return DUPLICATE_PHONE_E164_CONSTRAINT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export function isDuplicateCustomerPhoneError(error: unknown): boolean {
  if (isDuplicateCustomerPhoneE164Error(error)) return true;
  const normalized = errorMessage(error).toLowerCase();
  return DUPLICATE_PHONE_CONSTRAINT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export function formatDuplicateCustomerEmailMessage(): string {
  return "A customer with this email already exists in your workspace.";
}

export function formatDuplicateCustomerPhoneMessage(): string {
  return "A customer with this phone number already exists in your workspace.";
}

export function formatAmbiguousCustomerEmailMessage(): string {
  return "Multiple customers share this email. Resolve the duplicate before continuing.";
}

export function toCustomerMutationError(error: unknown): Error {
  if (isDuplicateCustomerEmailError(error)) {
    return new Error(formatDuplicateCustomerEmailMessage());
  }
  if (isDuplicateCustomerPhoneError(error)) {
    return new Error(formatDuplicateCustomerPhoneMessage());
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}
