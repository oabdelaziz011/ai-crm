const DUPLICATE_EMAIL_CONSTRAINT_MARKERS = [
  "idx_customers_company_email_unique",
  "idx_customer_user_email",
  "customers_company_email_unique",
  "duplicate key value violates unique constraint",
] as const;

export function normalizeCustomerEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function isDuplicateCustomerEmailError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();
  return DUPLICATE_EMAIL_CONSTRAINT_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export function formatDuplicateCustomerEmailMessage(): string {
  return "A customer with this email already exists in your workspace.";
}

export function formatAmbiguousCustomerEmailMessage(): string {
  return "Multiple customers share this email. Resolve the duplicate before continuing.";
}

export function toCustomerMutationError(error: unknown): Error {
  if (isDuplicateCustomerEmailError(error)) {
    return new Error(formatDuplicateCustomerEmailMessage());
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}
