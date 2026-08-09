import { OpportunityValidationError } from "./errors.js";

function normalizeCurrency(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  return trimmed || null;
}

/** Manual create — explicit currency wins, else company billing default from runtime. */
export function resolveManualOpportunityCurrency(
  explicit: string | undefined,
  companyDefaultCurrency: string | undefined,
): string {
  const explicitCode = normalizeCurrency(explicit);
  if (explicitCode) return explicitCode;

  const companyCode = normalizeCurrency(companyDefaultCurrency);
  if (companyCode) return companyCode;

  throw new OpportunityValidationError(
    "Company billing currency is required to create an opportunity.",
  );
}

/**
 * Create from lead — keep explicit non-USD lead currency; missing or legacy USD
 * falls back to company billing default (not hardcoded USD).
 */
export function resolveLeadOpportunityCurrency(
  leadCurrency: string | null | undefined,
  companyDefaultCurrency: string | undefined,
): string {
  const leadCode = normalizeCurrency(leadCurrency);
  const companyCode = normalizeCurrency(companyDefaultCurrency);

  if (leadCode && leadCode !== "USD") return leadCode;
  if (companyCode) return companyCode;
  if (leadCode) return leadCode;

  throw new OpportunityValidationError(
    "Company billing currency is required to create an opportunity.",
  );
}
