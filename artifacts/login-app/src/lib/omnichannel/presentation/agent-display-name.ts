import type { Profile } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return EMAIL_PATTERN.test(value.trim());
}

export type AgentDisplayNameResult = {
  display: string;
  tooltip?: string;
};

export function resolveAgentDisplayName(input: {
  rawLabel?: string | null;
  fullName?: string | null;
  displayName?: string | null;
  fallback?: string;
}): AgentDisplayNameResult {
  const fallback = input.fallback ?? "Support Agent";
  const raw = input.rawLabel?.trim() ?? "";
  const email = looksLikeEmail(raw) ? raw : looksLikeEmail(input.fullName) ? input.fullName!.trim() : undefined;
  const fullName = input.fullName?.trim() && !looksLikeEmail(input.fullName) ? input.fullName.trim() : null;
  const displayName = input.displayName?.trim() && !looksLikeEmail(input.displayName) ? input.displayName.trim() : null;

  if (fullName) return { display: fullName, tooltip: email };
  if (displayName) return { display: displayName, tooltip: email };
  if (raw && !looksLikeEmail(raw)) return { display: raw, tooltip: email };
  return { display: fallback, tooltip: email ?? (raw || undefined) };
}

export function resolveAgentDisplayNameFromProfile(
  profile: Profile | undefined,
  rawLabel?: string | null,
  fallback = "Support Agent",
): AgentDisplayNameResult {
  return resolveAgentDisplayName({
    rawLabel,
    fullName: profile?.full_name,
    displayName: profile?.job_title,
    fallback,
  });
}

export function resolveUserDisplayName(
  userId: string | null | undefined,
  rawLabel: string | null | undefined,
  agentsById: ReadonlyMap<string, { id: string; name: string }>,
  profilesByUserId: ReadonlyMap<string, Profile>,
  fallback = "Support Agent",
): AgentDisplayNameResult {
  const agent = userId ? agentsById.get(userId) : undefined;
  const profile = userId ? profilesByUserId.get(userId) : undefined;
  const staffName = agent?.name?.trim() && !looksLikeEmail(agent.name) ? agent.name.trim() : null;
  const fullName =
    profile?.full_name?.trim() && !looksLikeEmail(profile.full_name) ? profile.full_name.trim() : null;
  const profileName =
    profile?.job_title?.trim() && !looksLikeEmail(profile.job_title) ? profile.job_title.trim() : null;
  const raw = rawLabel?.trim() ?? "";
  const email =
    (looksLikeEmail(raw) ? raw : undefined)
    ?? (profile?.email?.trim() && looksLikeEmail(profile.email) ? profile.email.trim() : undefined);

  if (staffName) return { display: staffName, tooltip: email };
  if (fullName) return { display: fullName, tooltip: email };
  if (profileName) return { display: profileName, tooltip: email };
  if (raw && !looksLikeEmail(raw)) return { display: raw, tooltip: email };
  if (email) return { display: email, tooltip: email };
  return { display: fallback, tooltip: email };
}
