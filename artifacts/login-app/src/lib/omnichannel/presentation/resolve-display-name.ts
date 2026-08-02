import type { Profile } from "@/lib/types";
import {
  looksLikeEmail,
  resolveAgentDisplayName,
  type AgentDisplayNameResult,
} from "@/lib/omnichannel/presentation/agent-display-name";

export type ResolveDisplayNameInput = {
  userId?: string | null;
  rawLabel?: string | null;
  displayName?: string | null;
  crmName?: string | null;
  channelName?: string | null;
  phone?: string | null;
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  fallback?: string;
};

function trimNonEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || looksLikeEmail(trimmed)) return null;
  return trimmed;
}

function resolveEmail(
  rawLabel: string | null | undefined,
  profile: Profile | undefined,
): string | undefined {
  const profileEmail = profile?.email?.trim();
  if (profileEmail && looksLikeEmail(profileEmail)) return profileEmail;
  const raw = rawLabel?.trim();
  if (raw && looksLikeEmail(raw)) return raw;
  return undefined;
}

/** Unified display-name resolution for timeline, header, and activity surfaces. */
export function resolveDisplayName(input: ResolveDisplayNameInput): AgentDisplayNameResult {
  const fallback = input.fallback ?? "";
  const userId = input.userId ?? null;
  const agent = userId ? input.agentsById?.get(userId) : undefined;
  const profile = userId ? input.profilesByUserId?.get(userId) : undefined;
  const email = resolveEmail(input.rawLabel, profile);

  const crmName = trimNonEmail(input.crmName);
  if (crmName) return { display: crmName, tooltip: email };

  const displayName = trimNonEmail(input.displayName);
  if (displayName) return { display: displayName, tooltip: email };

  const fullName = trimNonEmail(profile?.full_name);
  if (fullName) return { display: fullName, tooltip: email };

  const staffName = trimNonEmail(agent?.name);
  if (staffName) return { display: staffName, tooltip: email };

  const profileName = trimNonEmail(profile?.job_title);
  if (profileName) return { display: profileName, tooltip: email };

  const channelName = trimNonEmail(input.channelName);
  if (channelName) return { display: channelName, tooltip: email };

  const phone = input.phone?.trim();
  if (phone) return { display: phone, tooltip: email };

  if (email) return { display: email, tooltip: email };

  const raw = input.rawLabel?.trim() ?? "";
  if (raw && !looksLikeEmail(raw)) return { display: raw, tooltip: email };

  return resolveAgentDisplayName({
    rawLabel: input.rawLabel,
    fullName: profile?.full_name,
    displayName: profile?.job_title,
    fallback,
  });
}

export function resolveTargetDisplayName(
  targetType: string | undefined,
  targetId: string | undefined,
  targetLabel: string | undefined,
  context: {
    agentsById?: ReadonlyMap<string, { id: string; name: string }>;
    profilesByUserId?: ReadonlyMap<string, Profile>;
    fallback?: string;
  },
): string {
  if (!targetLabel?.trim() && !targetId) return context.fallback ?? "";

  if (targetType === "user" || targetType === "ai_employee") {
    return resolveDisplayName({
      userId: targetId,
      rawLabel: targetLabel,
      agentsById: context.agentsById,
      profilesByUserId: context.profilesByUserId,
      fallback: context.fallback ?? "",
    }).display;
  }

  const label = targetLabel?.trim();
  if (label && !looksLikeEmail(label)) return label;
  return targetId ?? context.fallback ?? "";
}
