import type {
  CustomerImportDuplicatePolicy,
  DuplicateCandidate,
  NormalizedImportRow,
} from "./types.js";

export type ExistingCustomerMatchIndex = {
  byEmail: Map<string, string>;
  byPhoneE164: Map<string, string>;
};

export function buildExistingCustomerMatchIndex(
  customers: Array<{ id: string; email?: string | null; phone_e164?: string | null }>,
): ExistingCustomerMatchIndex {
  const byEmail = new Map<string, string>();
  const byPhoneE164 = new Map<string, string>();
  for (const customer of customers) {
    const email = customer.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, customer.id);
    const phone = customer.phone_e164?.trim();
    if (phone && !byPhoneE164.has(phone)) byPhoneE164.set(phone, customer.id);
  }
  return { byEmail, byPhoneE164 };
}

/**
 * Conservative duplicate detection:
 * - email exact (normalized)
 * - phone_e164 exact
 * - internal file duplicates on email/phone
 * Phone alone without E.164 is never treated as a definitive match.
 */
export function detectDuplicateCandidates(
  rows: NormalizedImportRow[],
  index: ExistingCustomerMatchIndex,
  policy: CustomerImportDuplicatePolicy,
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();

  const policyAction =
    policy === "skip" ? "skip" : policy === "update" ? "update" : "flag";

  for (const row of rows) {
    if (row.issues.some((issue) => issue.severity === "error")) continue;

    const email = row.values.email?.trim().toLowerCase();
    if (email) {
      const prior = seenEmail.get(email);
      if (prior != null) {
        candidates.push({
          rowNumber: row.rowNumber,
          matchKind: "file_internal",
          matchedValue: email,
          policyAction: "skip",
        });
      } else {
        seenEmail.set(email, row.rowNumber);
        const existingId = index.byEmail.get(email);
        if (existingId) {
          candidates.push({
            rowNumber: row.rowNumber,
            matchKind: "email",
            existingCustomerId: existingId,
            matchedValue: email,
            policyAction,
          });
        }
      }
    }

    const phone = row.values.phone?.trim();
    if (phone && phone.startsWith("+")) {
      const prior = seenPhone.get(phone);
      if (prior != null) {
        candidates.push({
          rowNumber: row.rowNumber,
          matchKind: "file_internal",
          matchedValue: phone,
          policyAction: "skip",
        });
      } else {
        seenPhone.set(phone, row.rowNumber);
        const existingId = index.byPhoneE164.get(phone);
        if (existingId) {
          candidates.push({
            rowNumber: row.rowNumber,
            matchKind: "phone_e164",
            existingCustomerId: existingId,
            matchedValue: phone,
            policyAction,
          });
        }
      }
    }
  }

  return candidates;
}
