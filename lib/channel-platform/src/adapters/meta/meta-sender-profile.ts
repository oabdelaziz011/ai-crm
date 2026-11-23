import type { NormalizedInboundMessageDto } from "../../dto/channel-dto.js";

export type MetaSenderProfile = {
  senderName: string | null;
  profilePicUrl: string | null;
};

export type FetchMetaSenderProfileInput = {
  channelKey: "messenger" | "instagram";
  senderExternalId: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

function sanitizeGraphVersion(version: string | undefined): string {
  const raw = String(version ?? "v21.0").trim() || "v21.0";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function buildDisplayName(input: {
  name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}): string | null {
  const full = String(input.name ?? "").trim();
  if (full) return full;
  const parts = [input.firstName, input.lastName].map((p) => String(p ?? "").trim()).filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  const username = String(input.username ?? "").trim();
  return username || null;
}

/**
 * Best-effort Graph lookup for Messenger PSID / Instagram IGSID profile.
 * Never throws — returns nulls on permission/API errors so inbound still proceeds.
 */
export async function fetchMetaSenderProfile(
  input: FetchMetaSenderProfileInput,
): Promise<MetaSenderProfile> {
  const senderId = String(input.senderExternalId ?? "").trim();
  const token = String(input.accessToken ?? "").trim();
  if (!senderId || !token) {
    return { senderName: null, profilePicUrl: null };
  }

  const version = sanitizeGraphVersion(input.apiVersion);
  const fetchImpl = input.fetchImpl ?? fetch;
  const host =
    input.channelKey === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
  const fields =
    input.channelKey === "instagram"
      ? "name,username,profile_pic"
      : "first_name,last_name,name,profile_pic";

  const url = new URL(`https://${host}/${version}/${encodeURIComponent(senderId)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  try {
    const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as {
      name?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
      profile_pic?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { senderName: null, profilePicUrl: null };
    }
    return {
      senderName: buildDisplayName({
        name: json.name,
        firstName: json.first_name,
        lastName: json.last_name,
        username: json.username,
      }),
      profilePicUrl: typeof json.profile_pic === "string" && json.profile_pic.trim()
        ? json.profile_pic.trim()
        : null,
    };
  } catch {
    return { senderName: null, profilePicUrl: null };
  }
}

/** Merge sender profile into inbound metadata without overwriting existing values. */
export function applyMetaSenderProfileToNormalized(
  normalized: NormalizedInboundMessageDto,
  channelKey: "messenger" | "instagram",
  profile: MetaSenderProfile,
): NormalizedInboundMessageDto {
  const metadata: Record<string, unknown> = { ...(normalized.metadata ?? {}) };
  if (profile.senderName && typeof metadata.senderName !== "string") {
    metadata.senderName = profile.senderName;
  }
  if (profile.profilePicUrl) {
    if (channelKey === "messenger" && typeof metadata.messengerProfilePic !== "string") {
      metadata.messengerProfilePic = profile.profilePicUrl;
    }
    if (channelKey === "instagram" && typeof metadata.instagramProfilePic !== "string") {
      metadata.instagramProfilePic = profile.profilePicUrl;
    }
    if (typeof metadata.profilePicUrl !== "string") {
      metadata.profilePicUrl = profile.profilePicUrl;
    }
  }
  return { ...normalized, metadata };
}
