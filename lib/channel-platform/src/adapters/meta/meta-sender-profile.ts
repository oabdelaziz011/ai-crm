import type { NormalizedInboundMessageDto } from "../../dto/channel-dto.js";

export type MetaSenderProfile = {
  senderName: string | null;
  profilePicUrl: string | null;
  /** Instagram username when Graph returns one. */
  username?: string | null;
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
    return { senderName: null, profilePicUrl: null, username: null };
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
      return { senderName: null, profilePicUrl: null, username: null };
    }
    const username =
      typeof json.username === "string" && json.username.trim() ? json.username.trim() : null;
    return {
      senderName: buildDisplayName({
        name: json.name,
        firstName: json.first_name,
        lastName: json.last_name,
        username: json.username,
      }),
      profilePicUrl:
        typeof json.profile_pic === "string" && json.profile_pic.trim()
          ? json.profile_pic.trim()
          : null,
      username,
    };
  } catch {
    return { senderName: null, profilePicUrl: null, username: null };
  }
}

/** Merge sender profile into inbound message metadata (refresh name + photo when Graph returns them). */
export function applyMetaSenderProfileToNormalized(
  normalized: NormalizedInboundMessageDto,
  channelKey: "messenger" | "instagram",
  profile: MetaSenderProfile,
): NormalizedInboundMessageDto {
  const metadata: Record<string, unknown> = { ...(normalized.metadata ?? {}) };
  if (profile.senderName) {
    metadata.senderName = profile.senderName;
  }
  if (profile.username) {
    metadata.username = profile.username;
    if (channelKey === "instagram") {
      metadata.instagramUsername = profile.username;
      metadata.channelUsername = profile.username;
    }
  }
  if (profile.profilePicUrl) {
    metadata.profilePicUrl = profile.profilePicUrl;
    if (channelKey === "messenger") {
      metadata.messengerProfilePic = profile.profilePicUrl;
    }
    if (channelKey === "instagram") {
      metadata.instagramProfilePic = profile.profilePicUrl;
    }
  }
  return { ...normalized, metadata };
}

/**
 * Build conversation-metadata fields from an enriched inbound message so Omnichannel
 * can show provider name + photo on existing threads (not only on first create).
 */
export function buildMetaSenderConversationMetadataPatch(
  channelKey: "messenger" | "instagram",
  inboundMetadata: Record<string, unknown> | null | undefined,
  currentConversationMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const inbound = inboundMetadata ?? {};
  const current = currentConversationMetadata ?? {};
  const patch: Record<string, unknown> = {};

  const senderName =
    typeof inbound.senderName === "string" && inbound.senderName.trim()
      ? inbound.senderName.trim()
      : null;
  if (senderName && current.senderName !== senderName) {
    patch.senderName = senderName;
  }

  const profilePicUrl =
    typeof inbound.profilePicUrl === "string" && inbound.profilePicUrl.trim()
      ? inbound.profilePicUrl.trim()
      : channelKey === "messenger" &&
          typeof inbound.messengerProfilePic === "string" &&
          inbound.messengerProfilePic.trim()
        ? inbound.messengerProfilePic.trim()
        : channelKey === "instagram" &&
            typeof inbound.instagramProfilePic === "string" &&
            inbound.instagramProfilePic.trim()
          ? inbound.instagramProfilePic.trim()
          : null;

  if (profilePicUrl) {
    if (current.profilePicUrl !== profilePicUrl) patch.profilePicUrl = profilePicUrl;
    if (channelKey === "messenger" && current.messengerProfilePic !== profilePicUrl) {
      patch.messengerProfilePic = profilePicUrl;
    }
    if (channelKey === "instagram" && current.instagramProfilePic !== profilePicUrl) {
      patch.instagramProfilePic = profilePicUrl;
    }
  }

  if (channelKey === "instagram") {
    const username =
      typeof inbound.instagramUsername === "string" && inbound.instagramUsername.trim()
        ? inbound.instagramUsername.trim()
        : typeof inbound.username === "string" && inbound.username.trim()
          ? inbound.username.trim()
          : typeof inbound.channelUsername === "string" && inbound.channelUsername.trim()
            ? inbound.channelUsername.trim()
            : null;
    if (username) {
      if (current.instagramUsername !== username) patch.instagramUsername = username;
      if (current.channelUsername !== username) patch.channelUsername = username;
      if (current.username !== username) patch.username = username;
    }
  }

  if (channelKey === "messenger" && senderName && current.messengerName !== senderName) {
    patch.messengerName = senderName;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
