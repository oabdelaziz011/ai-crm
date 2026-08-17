import type { CompanyOnboardingPayload, CompanyOnboardingValues } from "./types";

const STORAGE_KEY = "valueor.pending_company_onboarding_v1";
const AWAITING_KEY = "valueor.awaiting_company_membership";
/** Set after register/onboard succeeds so the gate never opens an empty second wizard. */
const COMPLETED_KEY = "valueor.company_onboarding_completed_at";
const COMPLETED_TTL_MS = 10 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingCompanyOnboarding(payload: CompanyOnboardingPayload): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Migrate away from older sessionStorage copies.
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPendingCompanyOnboarding(): CompanyOnboardingPayload | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw =
      store.getItem(STORAGE_KEY) ??
      (typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanyOnboardingPayload;
    if (!parsed || typeof parsed !== "object" || !parsed.name) return null;
    // Promote session → local so remounts / tab restores keep the draft.
    store.setItem(STORAGE_KEY, raw);
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCompanyOnboarding(): void {
  const store = storage();
  try {
    store?.removeItem(STORAGE_KEY);
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function markAwaitingCompanyMembership(): void {
  try {
    storage()?.setItem(AWAITING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAwaitingCompanyMembership(): void {
  try {
    storage()?.removeItem(AWAITING_KEY);
  } catch {
    /* ignore */
  }
}

export function isAwaitingCompanyMembership(): boolean {
  try {
    return storage()?.getItem(AWAITING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCompanyOnboardingCompleted(): void {
  try {
    storage()?.setItem(COMPLETED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearCompanyOnboardingCompleted(): void {
  try {
    storage()?.removeItem(COMPLETED_KEY);
  } catch {
    /* ignore */
  }
}

/** True for a short window after a successful register/onboard. */
export function wasCompanyOnboardingJustCompleted(): boolean {
  try {
    const raw = storage()?.getItem(COMPLETED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) {
      storage()?.removeItem(COMPLETED_KEY);
      return false;
    }
    if (Date.now() - at > COMPLETED_TTL_MS) {
      storage()?.removeItem(COMPLETED_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Map a stored onboarding payload back into wizard form values. */
export function companyOnboardingValuesFromPayload(
  payload: CompanyOnboardingPayload,
): Partial<CompanyOnboardingValues> {
  const displayName = (payload.owner_display_name || payload.owner_full_name || "").trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  const ownerFirstName = parts[0] ?? "";
  const ownerLastName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0] ?? "";

  return {
    name: payload.name ?? "",
    legalName: payload.legal_name ?? "",
    businessType: payload.business_type ?? "",
    industry: payload.industry ?? "",
    contactEmail: payload.contact_email ?? "",
    contactPhone: payload.contact_phone ?? "",
    website: payload.website ?? "",
    description: payload.description ?? "",
    taxId: payload.tax_id ?? "",
    commercialRegistration: payload.commercial_registration ?? "",
    country: payload.country ?? "",
    city: payload.city ?? "",
    address: payload.address ?? "",
    timezone: payload.timezone || "Asia/Riyadh",
    currency: payload.currency || "SAR",
    ownerFirstName,
    ownerLastName,
    ownerDisplayName: displayName,
    ownerPhone: payload.owner_phone ?? "",
    ownerJobTitle: payload.owner_job_title || "Owner",
  };
}
