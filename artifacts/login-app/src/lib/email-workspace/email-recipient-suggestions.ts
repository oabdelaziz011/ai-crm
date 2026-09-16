/**
 * Pure email recipient suggestion ranking/matching for the Email Composer.
 * No network I/O — callers supply company-scoped candidates.
 */

export const EMAIL_RECIPIENT_SUGGEST_MIN_CHARS = 2;
export const EMAIL_RECIPIENT_SUGGEST_LIMIT = 15;
export const EMAIL_RECIPIENT_SUGGEST_DEBOUNCE_MS = 280;

export type EmailRecipientSuggestionSource = "customer" | "participant";

export type EmailRecipientSuggestion = {
  email: string;
  displayName: string | null;
  customerId: string | null;
  source: EmailRecipientSuggestionSource;
  score: number;
};

export type EmailRecipientSuggestionCandidate = {
  email: string;
  displayName?: string | null;
  customerId?: string | null;
  source: EmailRecipientSuggestionSource;
};

function normalizeEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeQuery(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

/** True when the draft query is long enough to request suggestions. */
export function shouldRequestRecipientSuggestions(query: string): boolean {
  return normalizeQuery(query).length >= EMAIL_RECIPIENT_SUGGEST_MIN_CHARS;
}

/**
 * Case-insensitive match against display name and/or email.
 * Prefers prefix matches for Gmail/Outlook-like feel.
 */
export function matchesRecipientSuggestionQuery(
  candidate: { email: string; displayName?: string | null },
  query: string,
): boolean {
  const q = normalizeQuery(query);
  if (q.length < EMAIL_RECIPIENT_SUGGEST_MIN_CHARS) return false;
  const email = normalizeEmail(candidate.email);
  if (!email.includes("@")) return false;
  const name = String(candidate.displayName ?? "").trim().toLowerCase();
  if (email.startsWith(q) || email.includes(q)) return true;
  if (name && (name.startsWith(q) || name.includes(q))) return true;
  return false;
}

function scoreCandidate(
  candidate: EmailRecipientSuggestionCandidate,
  query: string,
): number {
  const q = normalizeQuery(query);
  const email = normalizeEmail(candidate.email);
  const name = String(candidate.displayName ?? "").trim().toLowerCase();
  let score = 0;

  if (email === q) score += 1000;
  else if (email.startsWith(q)) score += 800;
  else if (email.includes(q)) score += 500;

  if (name) {
    if (name === q) score += 900;
    else if (name.startsWith(q)) score += 700;
    else if (name.includes(q)) score += 400;
  }

  // Prefer CRM customers over bare conversation participants when scores tie-ish.
  if (candidate.source === "customer") score += 50;
  if (candidate.customerId) score += 10;

  return score;
}

/**
 * Merge customers + participants, exclude already-selected emails, rank, bound.
 * Deterministic: no invented contacts; empty inputs yield empty results.
 */
export function rankAndMergeRecipientSuggestions(input: {
  query: string;
  customers?: EmailRecipientSuggestionCandidate[];
  participants?: EmailRecipientSuggestionCandidate[];
  excludeEmails?: readonly string[];
  limit?: number;
}): EmailRecipientSuggestion[] {
  const q = normalizeQuery(input.query);
  if (q.length < EMAIL_RECIPIENT_SUGGEST_MIN_CHARS) return [];

  const exclude = new Set(
    (input.excludeEmails ?? []).map((email) => normalizeEmail(email)).filter(Boolean),
  );
  const byEmail = new Map<string, EmailRecipientSuggestionCandidate>();

  const ingest = (rows: EmailRecipientSuggestionCandidate[] | undefined) => {
    for (const row of rows ?? []) {
      const email = normalizeEmail(row.email);
      if (!email.includes("@")) continue;
      if (exclude.has(email)) continue;
      if (!matchesRecipientSuggestionQuery(row, q)) continue;
      const existing = byEmail.get(email);
      // Prefer customer rows (with name/id) over participant-only rows.
      if (
        !existing ||
        (row.source === "customer" && existing.source !== "customer") ||
        (Boolean(row.customerId) && !existing.customerId) ||
        (Boolean(row.displayName?.trim()) && !existing.displayName?.trim())
      ) {
        byEmail.set(email, {
          email: row.email.trim(),
          displayName: row.displayName?.trim() || null,
          customerId: row.customerId ?? null,
          source: row.source,
        });
      }
    }
  };

  // Customers first so they win conflicts, then participants.
  ingest(input.customers);
  ingest(input.participants);

  const ranked = [...byEmail.values()]
    .map((row) => ({
      email: row.email.trim(),
      displayName: row.displayName?.trim() || null,
      customerId: row.customerId ?? null,
      source: row.source,
      score: scoreCandidate(row, q),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const an = (a.displayName || a.email).toLowerCase();
      const bn = (b.displayName || b.email).toLowerCase();
      return an.localeCompare(bn);
    });

  const limit = Math.max(1, input.limit ?? EMAIL_RECIPIENT_SUGGEST_LIMIT);
  return ranked.slice(0, limit);
}

/**
 * Extract known participant emails from company-scoped conversation metadata.
 * Never invents addresses — only reads draft/outbound fields already present.
 */
export function extractParticipantCandidatesFromConversationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): EmailRecipientSuggestionCandidate[] {
  if (!metadata || typeof metadata !== "object") return [];
  const out: EmailRecipientSuggestionCandidate[] = [];
  const push = (email: unknown, name?: unknown) => {
    if (typeof email !== "string" || !email.trim().includes("@")) return;
    out.push({
      email: email.trim(),
      displayName: typeof name === "string" && name.trim() ? name.trim() : null,
      source: "participant",
    });
  };

  const draft = metadata.emailComposerDraft;
  if (draft && typeof draft === "object") {
    const record = draft as Record<string, unknown>;
    for (const key of ["to", "cc", "bcc"] as const) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) push(item);
      } else if (typeof value === "string") {
        for (const part of value.split(/[,;]+/)) push(part);
      }
    }
  }

  if (Array.isArray(metadata.recipientEmails)) {
    for (const item of metadata.recipientEmails) push(item);
  }
  if (typeof metadata.recipientEmail === "string") push(metadata.recipientEmail);

  for (const key of ["cc", "bcc", "to"] as const) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") push(item);
        else if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          push(row.email ?? row.address, row.name);
        }
      }
    }
  }

  if (metadata.from && typeof metadata.from === "object") {
    const from = metadata.from as Record<string, unknown>;
    push(from.email ?? from.address, from.name);
  }
  if (typeof metadata.senderExternalId === "string") push(metadata.senderExternalId);

  return out;
}

/** Filter a bounded local participant list against the query (no network). */
export function filterParticipantCandidates(
  candidates: readonly EmailRecipientSuggestionCandidate[],
  query: string,
  excludeEmails: readonly string[] = [],
  limit = EMAIL_RECIPIENT_SUGGEST_LIMIT,
): EmailRecipientSuggestionCandidate[] {
  const q = normalizeQuery(query);
  if (q.length < EMAIL_RECIPIENT_SUGGEST_MIN_CHARS) return [];
  const exclude = new Set(excludeEmails.map(normalizeEmail).filter(Boolean));
  const seen = new Set<string>();
  const out: EmailRecipientSuggestionCandidate[] = [];
  for (const row of candidates) {
    const email = normalizeEmail(row.email);
    if (!email || exclude.has(email) || seen.has(email)) continue;
    if (!matchesRecipientSuggestionQuery(row, q)) continue;
    seen.add(email);
    out.push({
      email: row.email.trim(),
      displayName: row.displayName?.trim() || null,
      customerId: row.customerId ?? null,
      source: "participant",
    });
    if (out.length >= limit) break;
  }
  return out;
}
