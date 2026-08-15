import type { CompanyOnboardingPayload } from "@/lib/companies/onboarding";

const STORAGE_KEY = "valueor.pending_company_onboarding_v1";

export function savePendingCompanyOnboarding(payload: CompanyOnboardingPayload): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPendingCompanyOnboarding(): CompanyOnboardingPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanyOnboardingPayload;
    if (!parsed || typeof parsed !== "object" || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCompanyOnboarding(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
