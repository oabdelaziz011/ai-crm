/** Digit-equivalent phone collapse for booking/CRM continuity (mirrors scheduling search). */

import { resolvePhoneIdentity } from "@workspace/ai-tool-router";

export function normalizeCustomerPhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Phase D3 hierarchy for equivalence:
 * 1. exact phone_e164 (when both sides resolve or provide e164)
 * 2. exact digit string
 * 3. last-9 compatibility fallback only (never overrides e164 mismatch)
 */
export function customerPhonesDigitEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
  leftE164?: string | null,
  rightE164?: string | null,
): boolean {
  const le =
    (typeof leftE164 === "string" && leftE164.trim()) ||
    (() => {
      const r = resolvePhoneIdentity({ phone: left, source: "explicit" });
      return r.status === "resolved" ? r.phoneE164 : null;
    })();
  const re =
    (typeof rightE164 === "string" && rightE164.trim()) ||
    (() => {
      const r = resolvePhoneIdentity({ phone: right, source: "explicit" });
      return r.status === "resolved" ? r.phoneE164 : null;
    })();

  if (le && re) return le === re;
  // One side has canonical identity and the other does not — do not force last-9 over e164 absence as identity.
  // Fall through to legacy digit / last-9 only when neither has conflicting e164.

  const a = normalizeCustomerPhoneDigits(left);
  const b = normalizeCustomerPhoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 9) return false;
  return a.slice(-9) === b.slice(-9);
}

export type PhoneCollapseCandidate = {
  id: string;
  phone?: string | null;
  /** Phase D3 — when present, exact e164 grouping beats last-9. */
  phoneE164?: string | null;
};

/**
 * When fuzzy search returns multiple customers that are the same national number
 * stored as 010… and 2010…, collapse to one canonical id.
 *
 * Preferred hierarchy (D3):
 * 1. exact company-scoped phone_e164 groups
 * 2. legacy digit / last-9 compatibility groups (only when e164 absent)
 * Prefer the customer with more scheduling bookings; then longer digit storage (E.164).
 * Returns null when matches are truly distinct identities.
 */
export function pickCanonicalCustomerIdFromPhoneMatches(
  matches: PhoneCollapseCandidate[],
  bookingCounts: Map<string, number>,
): string | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.id;

  // --- D3 primary: group by phone_e164 when present ---
  const e164Groups = new Map<string, PhoneCollapseCandidate[]>();
  const withoutE164: PhoneCollapseCandidate[] = [];
  for (const row of matches) {
    const e164 =
      (typeof row.phoneE164 === "string" && row.phoneE164.trim()) ||
      (() => {
        const r = resolvePhoneIdentity({ phone: row.phone, source: "explicit" });
        return r.status === "resolved" ? r.phoneE164 : "";
      })();
    if (e164) {
      const group = e164Groups.get(e164) ?? [];
      group.push(row);
      e164Groups.set(e164, group);
    } else {
      withoutE164.push(row);
    }
  }

  if (e164Groups.size === 1 && withoutE164.length === 0) {
    return pickPreferredId([...e164Groups.values()][0]!, bookingCounts);
  }
  if (e164Groups.size > 1) {
    // Distinct canonical identities — do not collapse via last-9.
    return null;
  }
  if (e164Groups.size === 1 && withoutE164.length > 0) {
    // Exact e164 beats last-9: prefer the e164 group; do not merge unresolved into it via last-9.
    return pickPreferredId([...e164Groups.values()][0]!, bookingCounts);
  }

  // --- Legacy last-9 compatibility (only when no e164 identities in the set) ---
  const last9Groups = new Map<string, PhoneCollapseCandidate[]>();
  for (const row of matches) {
    const digits = normalizeCustomerPhoneDigits(row.phone);
    if (!digits || digits.length < 9) {
      last9Groups.set(`id:${row.id}`, [row]);
      continue;
    }
    const key = digits.slice(-9);
    const group = last9Groups.get(key) ?? [];
    group.push(row);
    last9Groups.set(key, group);
  }

  if (last9Groups.size !== 1) return null;
  return pickPreferredId([...last9Groups.values()][0]!, bookingCounts);
}

function pickPreferredId(
  group: PhoneCollapseCandidate[],
  bookingCounts: Map<string, number>,
): string | null {
  const ids = [...new Set(group.map((row) => row.id))];
  if (ids.length === 1) return ids[0]!;

  const phoneLen = new Map(
    group.map((row) => [row.id, (normalizeCustomerPhoneDigits(row.phone) ?? "").length] as const),
  );

  ids.sort((a, b) => {
    const byBookings = (bookingCounts.get(b) ?? 0) - (bookingCounts.get(a) ?? 0);
    if (byBookings !== 0) return byBookings;
    return (phoneLen.get(b) ?? 0) - (phoneLen.get(a) ?? 0);
  });

  return ids[0]!;
}
