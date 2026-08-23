/** Digit-equivalent phone collapse for booking/CRM continuity (mirrors scheduling search). */

export function normalizeCustomerPhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function customerPhonesDigitEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
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
};

/**
 * When fuzzy search returns multiple customers that are the same national number
 * stored as 010… and 2010…, collapse to one canonical id.
 * Prefer the customer with more scheduling bookings; then longer digit storage (E.164).
 * Returns null when matches are truly distinct identities.
 */
export function pickCanonicalCustomerIdFromPhoneMatches(
  matches: PhoneCollapseCandidate[],
  bookingCounts: Map<string, number>,
): string | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.id;

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

  const group = [...last9Groups.values()][0]!;
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
