import type { BranchDraft } from "./branch-draft";

const STORAGE_KEY = "valueor.pending_onboarding_branches_v1";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingOnboardingBranches(drafts: BranchDraft[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* ignore quota */
  }
}

export function loadPendingOnboardingBranches(): BranchDraft[] | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BranchDraft[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((item) => item && typeof item.clientId === "string" && Array.isArray(item.days))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOnboardingBranches(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
