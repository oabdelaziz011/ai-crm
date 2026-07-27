/** Patterns that indicate destructive actions requiring user confirmation */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bmerge\b/i,
  /\bcancel\s+booking/i,
  /\brefund\b/i,
  /\bbulk\s+(update|delete|remove)/i,
  /\bimport\b/i,
  /\bpermanently\b/i,
  /\berase\b/i,
  /\barchive\s+all\b/i,
];

export type PendingConfirmation = {
  id: string;
  originalText: string;
  resolvedPrompt: string;
  actionLabel: string;
  createdAt: string;
};

export function isDestructiveAction(text: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function createPendingConfirmation(text: string, resolvedPrompt: string): PendingConfirmation {
  return {
    id: crypto.randomUUID(),
    originalText: text,
    resolvedPrompt,
    actionLabel: extractActionLabel(text),
    createdAt: new Date().toISOString(),
  };
}

function extractActionLabel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}

/** Wrap destructive intent so runtime receives explicit confirmation gate */
export function buildConfirmationPrompt(text: string): string {
  return `[CONFIRMATION REQUIRED — do not execute until user confirms] The user is requesting a potentially destructive action: "${text}". Ask them to explicitly confirm before proceeding. Never execute delete, merge, cancel, refund, or bulk operations without confirmation.`;
}
