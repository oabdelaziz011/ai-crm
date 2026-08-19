const TECHNICAL_RE = /sqlstate|permission denied|row-level security|stack|pg_|postgres|rpc|uuid|0x/i;

export function sanitizeCompanyLifecycleError(
  error: unknown,
  fallback: string,
): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.trim();
  if (!message || TECHNICAL_RE.test(message)) return fallback;

  const normalized = message.toLowerCase();
  if (normalized.includes("suspension_reason_required")) return fallback;
  if (normalized.includes("authentication required")) return fallback;
  if (normalized.includes("insufficient permissions")) return fallback;
  if (normalized.includes("subscription not found")) return fallback;
  if (normalized.includes("cannot suspend")) return fallback;
  return message.length > 180 ? fallback : message;
}

export function sanitizeCompanyCommercialError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.trim();
  if (!message || TECHNICAL_RE.test(message)) return fallback;
  const normalized = message.toLowerCase();
  if (normalized.includes("insufficient permissions")) return fallback;
  if (normalized.includes("authentication required")) return fallback;
  if (normalized.includes("trialing")) return fallback;
  if (normalized.includes("cannot change package")) return fallback;
  if (normalized.includes("subscription not found")) return fallback;
  if (normalized.includes("unknown feature")) return fallback;
  return message.length > 180 ? fallback : message;
}

export function companyReviewFooterActions(input: {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  pending: boolean;
}): {
  showBack: boolean;
  showReject: boolean;
  showNext: boolean;
  rejectPlacement: "start" | "end" | "none";
} {
  if (input.step === 1) {
    return {
      showBack: false,
      showReject: input.pending,
      showNext: true,
      rejectPlacement: input.pending ? "start" : "none",
    };
  }
  return {
    showBack: true,
    showReject: false,
    showNext: input.step < 6,
    rejectPlacement: "none",
  };
}
