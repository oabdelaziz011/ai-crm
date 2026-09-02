/**
 * Stable campaign-submission idempotency identity.
 *
 * One logical Confirm & Send submission must reuse ONE key so
 * UNIQUE(company_id, idempotency_key) can collapse double-clicks / retries / tabs
 * into a single campaign. Domain createDraft/execute remain the correctness boundary.
 */

export const CAMPAIGN_CREATE_IDEMPOTENCY_STORAGE_PREFIX =
  "valueor:campaigns:create:idempotency:";

export function campaignCreateIdempotencyStorageKey(companyId: string): string {
  return `${CAMPAIGN_CREATE_IDEMPOTENCY_STORAGE_PREFIX}${companyId.trim()}`;
}

export function createCampaignIdempotencyKey(nowMs: number = Date.now()): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `campaign-${nowMs}-${Math.random().toString(36).slice(2, 10)}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Return the in-progress submission key for this company, creating once if absent.
 * Cross-tab safe when sessionStorage is available.
 */
export function getOrCreateCampaignSubmissionIdempotencyKey(input: {
  companyId: string;
  storage?: StorageLike | null;
  createKey?: () => string;
}): string {
  const companyId = input.companyId.trim();
  if (!companyId) {
    throw new Error("companyId is required for campaign submission idempotency");
  }

  const storage = input.storage === undefined ? defaultStorage() : input.storage;
  const createKey = input.createKey ?? (() => createCampaignIdempotencyKey());
  const storageKey = campaignCreateIdempotencyStorageKey(companyId);

  if (storage) {
    const existing = storage.getItem(storageKey)?.trim();
    if (existing) return existing;
    const next = createKey().trim();
    if (!next) throw new Error("idempotency key must be non-empty");
    storage.setItem(storageKey, next);
    return next;
  }

  return createKey().trim();
}

/** Clear after a successful create+execute so the next intentional campaign gets a new key. */
export function clearCampaignSubmissionIdempotencyKey(input: {
  companyId: string;
  storage?: StorageLike | null;
}): void {
  const companyId = input.companyId.trim();
  if (!companyId) return;
  const storage = input.storage === undefined ? defaultStorage() : input.storage;
  storage?.removeItem(campaignCreateIdempotencyStorageKey(companyId));
}
