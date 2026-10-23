/** Shared phone or email is required. A similar name is not identity. */

/**
 * Canonical digit form for merge comparison.
 * Prefer full international digit strings; use Egyptian local↔intl bridges.
 * Last-10 is only a legacy bridge when both sides look like the same national mobile.
 */
export function normalizeLeadPhone(value: string | null | undefined): string | null {
  const arabic = (value ?? "").replace(/[\u0660-\u0669]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660),
  );
  const digits = arabic.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;

  if (/^01[0125]\d{8}$/.test(digits)) return `20${digits.slice(1)}`;
  if (/^201[0125]\d{8}$/.test(digits)) return digits;
  if (digits.startsWith("00") && digits.length >= 10) return digits.slice(2);
  return digits;
}

export function normalizeLeadEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  return email;
}

function isEgyptMobileDigits(digits: string): boolean {
  return /^201[0125]\d{8}$/.test(digits) || /^01[0125]\d{8}$/.test(digits);
}

function phonesShareVerifiedIdentity(a: string, b: string): boolean {
  if (a === b) return true;
  // Legacy bridge only for Egyptian mobiles that already normalized differently.
  if (!(isEgyptMobileDigits(a) && isEgyptMobileDigits(b))) return false;
  const aNat = a.startsWith("20") ? a.slice(2) : a.startsWith("0") ? a.slice(1) : a.slice(-10);
  const bNat = b.startsWith("20") ? b.slice(2) : b.startsWith("0") ? b.slice(1) : b.slice(-10);
  return aNat === bNat && /^1[0125]\d{8}$/.test(aNat);
}

export function leadsShareVerifiedIdentity(
  primary: { phone?: string | null; email?: string | null },
  duplicate: { phone?: string | null; email?: string | null },
): boolean {
  const primaryPhone = normalizeLeadPhone(primary.phone);
  const duplicatePhone = normalizeLeadPhone(duplicate.phone);
  if (primaryPhone && duplicatePhone && phonesShareVerifiedIdentity(primaryPhone, duplicatePhone)) {
    return true;
  }
  const primaryEmail = normalizeLeadEmail(primary.email);
  const duplicateEmail = normalizeLeadEmail(duplicate.email);
  return Boolean(primaryEmail && duplicateEmail && primaryEmail === duplicateEmail);
}
