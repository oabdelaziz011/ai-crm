import { looksLikeEmail } from "@/lib/omnichannel/presentation/agent-display-name";
import type { OwnershipTier } from "@/lib/omnichannel/presentation/conversation-ownership";

export type InboxAssigneeLabels = {
  aiEmployee: string;
  unassigned: string;
};

const COMPOUND_LABEL_SPLIT = /\s*[•·|]\s*/;

function isAiEmployeeSegment(segment: string, aiEmployeeLabel: string): boolean {
  const normalized = segment.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === aiEmployeeLabel.trim().toLowerCase()) return true;
  return normalized === "ai employee" || normalized === "ai" || normalized.includes("ذكاء");
}

/** Strip tier prefixes from compound owner labels (e.g. "AI Employee • Ahmed" → "Ahmed"). */
export function normalizeInboxAssigneeLabel(
  label: string | null | undefined,
  tier: OwnershipTier,
  labels: InboxAssigneeLabels,
): string {
  if (tier === "ai") return labels.aiEmployee;
  if (tier === "unassigned") return labels.unassigned;

  const trimmed = label?.trim() ?? "";
  if (!trimmed) return labels.unassigned;

  const segments = trimmed.split(COMPOUND_LABEL_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const humanSegments = segments.filter((part) => !isAiEmployeeSegment(part, labels.aiEmployee));
    const candidate = humanSegments[humanSegments.length - 1] ?? segments[segments.length - 1] ?? trimmed;
    if (candidate && !looksLikeEmail(candidate)) return candidate;
  }

  if (looksLikeEmail(trimmed)) return labels.unassigned;
  return trimmed;
}

export function resolveInboxAssigneeDisplay(
  ownerLabel: string | null | undefined,
  tier: OwnershipTier | undefined,
  labels: InboxAssigneeLabels,
): { tier: OwnershipTier; display: string } {
  const resolvedTier = tier ?? "unassigned";
  return {
    tier: resolvedTier,
    display: normalizeInboxAssigneeLabel(ownerLabel, resolvedTier, labels),
  };
}
