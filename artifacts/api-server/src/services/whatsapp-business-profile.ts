/**
 * WhatsApp Cloud API Business Profile management (per-tenant).
 * Graph calls stay server-side; phone number ID always comes from company credentials.
 */
import {
  createSupabaseWhatsAppCredentialsLoader,
  whatsAppGraphBaseUrl,
  type WhatsAppCanonicalCredentials,
  type WhatsAppCredentialsLoader,
} from "@workspace/channel-platform";
import type { SupabaseClient } from "@supabase/supabase-js";

export const WHATSAPP_BUSINESS_PROFILE_FIELDS =
  "about,address,description,email,profile_picture_url,websites,vertical" as const;

/** Writable WhatsAppVertical values (Meta excludes UNDEFINED / NOT_A_BIZ). */
export const WHATSAPP_BUSINESS_PROFILE_VERTICALS = [
  "OTHER",
  "AUTO",
  "BEAUTY",
  "APPAREL",
  "EDU",
  "ENTERTAIN",
  "EVENT_PLAN",
  "FINANCE",
  "GROCERY",
  "GOVT",
  "HOTEL",
  "HEALTH",
  "NONPROFIT",
  "PROF_SERVICES",
  "RETAIL",
  "TRAVEL",
  "RESTAURANT",
  "ALCOHOL",
  "ONLINE_GAMBLING",
  "OTC_DRUGS",
  "PHYSICAL_GAMBLING",
  "MATRIMONY_SERVICE",
] as const;

export type WhatsAppBusinessProfileVertical =
  (typeof WHATSAPP_BUSINESS_PROFILE_VERTICALS)[number];

export type WhatsAppBusinessProfileData = {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;
  profilePictureUrl: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** Meta Official Business Account blue-check status (read-only; Meta decides). */
  isOfficialBusinessAccount: boolean | null;
  /** Two-step verification PIN enabled on the Cloud API phone number. */
  isPinEnabled: boolean | null;
  /** Display-name review status from Meta (APPROVED ≠ blue check). */
  nameStatus: string | null;
  syncedAt: string;
};

export type WhatsAppBusinessProfileUpdateInput = {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  websites?: string[] | null;
  vertical?: string | null;
};

export type WhatsAppBusinessProfilePictureInput = {
  mimeType: string;
  /** Raw image bytes (already decoded from base64 at the route). */
  bytes: Buffer;
  fileName?: string;
};

const LIMITS = {
  aboutMin: 1,
  aboutMax: 139,
  addressMax: 256,
  descriptionMax: 512,
  emailMax: 128,
  websiteMax: 256,
  websiteCountMax: 2,
  imageMaxBytes: 5 * 1024 * 1024,
  imageMinSide: 192,
  imageMaxSide: 10240,
} as const;

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);

export class WhatsAppBusinessProfileError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number = 400,
    readonly metaErrorCode?: number,
  ) {
    super(message);
    this.name = "WhatsAppBusinessProfileError";
  }
}

export type WhatsAppBusinessProfileDeps = {
  credentialsLoader: WhatsAppCredentialsLoader;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  /** Meta App ID for Resumable Upload (/{app-id}/uploads). */
  metaAppId?: string | null;
};

function resolveMetaAppId(explicit?: string | null): string {
  const fromArg = String(explicit ?? "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String(
    process.env.META_EMBEDDED_SIGNUP_APP_ID ?? process.env.META_APP_ID ?? "",
  ).trim();
  if (!fromEnv) {
    throw new WhatsAppBusinessProfileError(
      "Meta App ID is not configured for Resumable Upload (META_EMBEDDED_SIGNUP_APP_ID).",
      "BP_META_APP_ID_MISSING",
      503,
    );
  }
  return fromEnv;
}

function graphVersion(credentials: WhatsAppCanonicalCredentials): string {
  return (credentials.apiVersion ?? "v21.0").trim() || "v21.0";
}

function redactMetaErrorMessage(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]")
    .replace(/EAA[A-Za-z0-9]+/g, "[REDACTED_TOKEN]");
}

async function graphFetch(
  fetchFn: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  try {
    return await fetchFn(input, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new WhatsAppBusinessProfileError(
      `Could not reach Meta Graph API (${redactMetaErrorMessage(detail)}).`,
      "BP_NETWORK",
      502,
    );
  }
}

async function readGraphJson(
  response: Response,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, body };
}

function mapGraphFailure(
  status: number,
  body: Record<string, unknown>,
  fallbackCode: string,
): never {
  const err = (body.error ?? {}) as Record<string, unknown>;
  const metaCode = typeof err.code === "number" ? err.code : undefined;
  const message = redactMetaErrorMessage(
    String(err.message ?? body.message ?? "Meta Graph request failed"),
  );

  if (status === 401 || metaCode === 190) {
    throw new WhatsAppBusinessProfileError(
      "WhatsApp access token is invalid or expired. Update the token in WhatsApp Settings.",
      "BP_TOKEN_INVALID",
      401,
      metaCode,
    );
  }
  if (status === 429 || metaCode === 4 || metaCode === 80007 || metaCode === 130429) {
    throw new WhatsAppBusinessProfileError(
      "Meta rate limit reached. Wait a moment and try again.",
      "BP_RATE_LIMITED",
      429,
      metaCode,
    );
  }
  // Meta may reject Cloud API business-profile ops for some Business App / unsupported modes.
  const metaSubcode = typeof err.error_subcode === "number" ? err.error_subcode : undefined;
  if (
    metaCode === 100 &&
    (metaSubcode === 33 ||
      /not supported|unsupported|business app|on-premises|coexistence/i.test(message))
  ) {
    throw new WhatsAppBusinessProfileError(
      "This WhatsApp connection mode does not support Cloud API Business Profile management. Use the supported WhatsApp Business / Meta Business Suite tools for this number.",
      "BP_UNSUPPORTED_MODE",
      422,
      metaCode,
    );
  }
  throw new WhatsAppBusinessProfileError(message, fallbackCode, status >= 400 ? status : 502, metaCode);
}

export function createWhatsAppBusinessProfileDeps(
  client: SupabaseClient,
  options?: { fetchFn?: typeof fetch; metaAppId?: string | null },
): WhatsAppBusinessProfileDeps {
  return {
    credentialsLoader: createSupabaseWhatsAppCredentialsLoader(client),
    fetchFn: options?.fetchFn,
    metaAppId: options?.metaAppId,
  };
}

async function loadConnectedCredentials(
  companyId: string,
  deps: WhatsAppBusinessProfileDeps,
): Promise<WhatsAppCanonicalCredentials> {
  const id = companyId.trim();
  if (!id) {
    throw new WhatsAppBusinessProfileError("companyId required", "BP_BAD_REQUEST", 400);
  }
  const credentials = await deps.credentialsLoader.loadByCompanyId(id);
  if (!credentials) {
    throw new WhatsAppBusinessProfileError(
      "WhatsApp is not connected for this company.",
      "BP_NOT_CONNECTED",
      404,
    );
  }
  if (!credentials.accessToken?.trim()) {
    throw new WhatsAppBusinessProfileError(
      "WhatsApp access token is missing for this company.",
      "BP_TOKEN_MISSING",
      400,
    );
  }
  if (!credentials.phoneNumberId?.trim()) {
    throw new WhatsAppBusinessProfileError(
      "WhatsApp Phone Number ID is missing for this company.",
      "BP_PHONE_NUMBER_ID_MISSING",
      400,
    );
  }
  return credentials;
}

function normalizeWebsites(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new WhatsAppBusinessProfileError(
      "websites must be an array of up to 2 URLs.",
      "BP_VALIDATION",
      400,
    );
  }
  if (input.length > LIMITS.websiteCountMax) {
    throw new WhatsAppBusinessProfileError(
      "A maximum of 2 websites is allowed.",
      "BP_VALIDATION",
      400,
    );
  }
  return input.map((item, index) => {
    const url = String(item ?? "").trim();
    if (!url) {
      throw new WhatsAppBusinessProfileError(
        `Website ${index + 1} cannot be empty.`,
        "BP_VALIDATION",
        400,
      );
    }
    if (url.length > LIMITS.websiteMax) {
      throw new WhatsAppBusinessProfileError(
        `Website ${index + 1} exceeds ${LIMITS.websiteMax} characters.`,
        "BP_VALIDATION",
        400,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new WhatsAppBusinessProfileError(
        `Website ${index + 1} must be a valid http(s) URL.`,
        "BP_VALIDATION",
        400,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new WhatsAppBusinessProfileError(
        `Website ${index + 1} must start with http:// or https://.`,
        "BP_VALIDATION",
        400,
      );
    }
    return url;
  });
}

export function validateWhatsAppBusinessProfileUpdate(
  input: WhatsAppBusinessProfileUpdateInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { messaging_product: "whatsapp" };
  let hasField = false;

  if (input.about !== undefined) {
    hasField = true;
    const about = input.about == null ? "" : String(input.about).trim();
    if (about.length < LIMITS.aboutMin || about.length > LIMITS.aboutMax) {
      throw new WhatsAppBusinessProfileError(
        `About must be between ${LIMITS.aboutMin} and ${LIMITS.aboutMax} characters.`,
        "BP_VALIDATION",
        400,
      );
    }
    payload.about = about;
  }

  if (input.address !== undefined) {
    hasField = true;
    const address = input.address == null ? "" : String(input.address).trim();
    if (address.length > LIMITS.addressMax) {
      throw new WhatsAppBusinessProfileError(
        `Address cannot exceed ${LIMITS.addressMax} characters.`,
        "BP_VALIDATION",
        400,
      );
    }
    payload.address = address;
  }

  if (input.description !== undefined) {
    hasField = true;
    const description = input.description == null ? "" : String(input.description).trim();
    if (description.length > LIMITS.descriptionMax) {
      throw new WhatsAppBusinessProfileError(
        `Description cannot exceed ${LIMITS.descriptionMax} characters.`,
        "BP_VALIDATION",
        400,
      );
    }
    payload.description = description;
  }

  if (input.email !== undefined) {
    hasField = true;
    const email = input.email == null ? "" : String(input.email).trim();
    if (email) {
      if (email.length > LIMITS.emailMax) {
        throw new WhatsAppBusinessProfileError(
          `Email cannot exceed ${LIMITS.emailMax} characters.`,
          "BP_VALIDATION",
          400,
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new WhatsAppBusinessProfileError("Email format is invalid.", "BP_VALIDATION", 400);
      }
    }
    payload.email = email;
  }

  if (input.websites !== undefined) {
    hasField = true;
    payload.websites = normalizeWebsites(input.websites);
  }

  if (input.vertical !== undefined) {
    hasField = true;
    const vertical = input.vertical == null ? "" : String(input.vertical).trim().toUpperCase();
    if (vertical && !WHATSAPP_BUSINESS_PROFILE_VERTICALS.includes(vertical as WhatsAppBusinessProfileVertical)) {
      throw new WhatsAppBusinessProfileError(
        "Vertical / category is not a supported Meta value.",
        "BP_VALIDATION",
        400,
      );
    }
    payload.vertical = vertical;
  }

  if (!hasField) {
    throw new WhatsAppBusinessProfileError(
      "Provide at least one business profile field to update.",
      "BP_VALIDATION",
      400,
    );
  }

  return payload;
}

/** Minimal PNG/JPEG dimension reader — no native image deps. */
export function readImageDimensions(
  bytes: Buffer,
  mimeType: string,
): { width: number; height: number } {
  const mime = mimeType.toLowerCase();
  if (mime === "image/png") {
    if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") {
      throw new WhatsAppBusinessProfileError("Invalid PNG image.", "BP_IMAGE_INVALID", 400);
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new WhatsAppBusinessProfileError("Invalid JPEG image.", "BP_IMAGE_INVALID", 400);
    }
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const size = bytes.readUInt16BE(offset + 2);
      // SOF0 / SOF2
      if (
        marker === 0xc0 ||
        marker === 0xc2 ||
        marker === 0xc1 ||
        marker === 0xc3
      ) {
        const height = bytes.readUInt16BE(offset + 5);
        const width = bytes.readUInt16BE(offset + 7);
        return { width, height };
      }
      offset += 2 + size;
    }
    throw new WhatsAppBusinessProfileError(
      "Could not read JPEG dimensions.",
      "BP_IMAGE_INVALID",
      400,
    );
  }
  throw new WhatsAppBusinessProfileError(
    "Only JPG and PNG profile pictures are supported.",
    "BP_IMAGE_UNSUPPORTED",
    400,
  );
}

export function validateProfilePictureBytes(input: WhatsAppBusinessProfilePictureInput): {
  mimeType: string;
  bytes: Buffer;
  width: number;
  height: number;
  fileName: string;
} {
  const mimeType = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new WhatsAppBusinessProfileError(
      "Only JPG and PNG profile pictures are supported.",
      "BP_IMAGE_UNSUPPORTED",
      400,
    );
  }
  const bytes = input.bytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new WhatsAppBusinessProfileError("Image data is required.", "BP_IMAGE_INVALID", 400);
  }
  if (bytes.length > LIMITS.imageMaxBytes) {
    throw new WhatsAppBusinessProfileError(
      `Profile picture must be ${LIMITS.imageMaxBytes / (1024 * 1024)}MB or smaller.`,
      "BP_IMAGE_TOO_LARGE",
      400,
    );
  }
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const { width, height } = readImageDimensions(bytes, normalizedMime);
  if (
    width < LIMITS.imageMinSide ||
    height < LIMITS.imageMinSide ||
    width > LIMITS.imageMaxSide ||
    height > LIMITS.imageMaxSide
  ) {
    throw new WhatsAppBusinessProfileError(
      `Profile picture must be at least ${LIMITS.imageMinSide}×${LIMITS.imageMinSide} pixels.`,
      "BP_IMAGE_DIMENSIONS",
      400,
    );
  }
  // WhatsApp stores a square crop (recommended 640×640); reject non-square before upload.
  if (width !== height) {
    throw new WhatsAppBusinessProfileError(
      "Profile picture must be square (equal width and height).",
      "BP_IMAGE_NOT_SQUARE",
      400,
    );
  }
  const fileName =
    String(input.fileName ?? "").trim() ||
    (normalizedMime === "image/png" ? "profile.png" : "profile.jpg");
  return { mimeType: normalizedMime, bytes, width, height, fileName };
}

type WhatsAppPhoneDisplayMeta = {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOfficialBusinessAccount: boolean | null;
  isPinEnabled: boolean | null;
  nameStatus: string | null;
};

function mapProfileRow(
  data: Record<string, unknown>,
  credentials: WhatsAppCanonicalCredentials,
  phoneMeta: WhatsAppPhoneDisplayMeta,
  syncedAt: string,
): WhatsAppBusinessProfileData {
  const websitesRaw = data.websites;
  const websites = Array.isArray(websitesRaw)
    ? websitesRaw.map((w) => String(w ?? "").trim()).filter(Boolean)
    : [];
  return {
    about: data.about == null ? null : String(data.about),
    address: data.address == null ? null : String(data.address),
    description: data.description == null ? null : String(data.description),
    email: data.email == null ? null : String(data.email),
    websites,
    vertical: data.vertical == null || data.vertical === "" ? null : String(data.vertical),
    profilePictureUrl:
      data.profile_picture_url == null ? null : String(data.profile_picture_url),
    phoneNumberId: credentials.phoneNumberId,
    displayPhoneNumber: phoneMeta.displayPhoneNumber,
    verifiedName: phoneMeta.verifiedName,
    isOfficialBusinessAccount: phoneMeta.isOfficialBusinessAccount,
    isPinEnabled: phoneMeta.isPinEnabled,
    nameStatus: phoneMeta.nameStatus,
    syncedAt,
  };
}

async function fetchPhoneDisplayMeta(
  credentials: WhatsAppCanonicalCredentials,
  fetchFn: typeof fetch,
): Promise<WhatsAppPhoneDisplayMeta> {
  const empty: WhatsAppPhoneDisplayMeta = {
    displayPhoneNumber: null,
    verifiedName: null,
    isOfficialBusinessAccount: null,
    isPinEnabled: null,
    nameStatus: null,
  };
  const url = `${whatsAppGraphBaseUrl(graphVersion(credentials))}/${credentials.phoneNumberId}?fields=display_phone_number,verified_name,is_official_business_account,is_pin_enabled,name_status`;
  let response: Response;
  try {
    response = await graphFetch(fetchFn, url, {
      method: "GET",
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
  } catch {
    return empty;
  }
  const parsed = await readGraphJson(response);
  if (!parsed.ok) {
    // Soft-fail: profile fields can still load.
    return empty;
  }
  return {
    displayPhoneNumber:
      parsed.body.display_phone_number == null
        ? null
        : String(parsed.body.display_phone_number),
    verifiedName:
      parsed.body.verified_name == null ? null : String(parsed.body.verified_name),
    isOfficialBusinessAccount:
      typeof parsed.body.is_official_business_account === "boolean"
        ? parsed.body.is_official_business_account
        : null,
    isPinEnabled:
      typeof parsed.body.is_pin_enabled === "boolean" ? parsed.body.is_pin_enabled : null,
    nameStatus:
      parsed.body.name_status == null ? null : String(parsed.body.name_status),
  };
}

/**
 * Phone-level verification / OBA status that does not depend on the
 * whatsapp_business_profile edge (which can return #10 when token/app scopes lag).
 */
export async function getWhatsAppPhoneVerificationStatus(
  companyId: string,
  deps: WhatsAppBusinessProfileDeps,
): Promise<{
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOfficialBusinessAccount: boolean | null;
  isPinEnabled: boolean | null;
  nameStatus: string | null;
  syncedAt: string;
}> {
  const credentials = await loadConnectedCredentials(companyId, deps);
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const phoneMeta = await fetchPhoneDisplayMeta(credentials, fetchFn);
  return {
    phoneNumberId: credentials.phoneNumberId,
    displayPhoneNumber: phoneMeta.displayPhoneNumber,
    verifiedName: phoneMeta.verifiedName,
    isOfficialBusinessAccount: phoneMeta.isOfficialBusinessAccount,
    isPinEnabled: phoneMeta.isPinEnabled,
    nameStatus: phoneMeta.nameStatus,
    syncedAt: new Date(deps.nowMs?.() ?? Date.now()).toISOString(),
  };
}

export async function getWhatsAppBusinessProfile(
  companyId: string,
  deps: WhatsAppBusinessProfileDeps,
): Promise<WhatsAppBusinessProfileData> {
  const credentials = await loadConnectedCredentials(companyId, deps);
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const version = graphVersion(credentials);
  const url = `${whatsAppGraphBaseUrl(version)}/${credentials.phoneNumberId}/whatsapp_business_profile?fields=${WHATSAPP_BUSINESS_PROFILE_FIELDS}`;

  const response = await graphFetch(fetchFn, url, {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  const parsed = await readGraphJson(response);
  const phoneMeta = await fetchPhoneDisplayMeta(credentials, fetchFn);
  const syncedAt = new Date(deps.nowMs?.() ?? Date.now()).toISOString();

  if (!parsed.ok) {
    const err = (parsed.body.error ?? {}) as Record<string, unknown>;
    const metaCode = typeof err.code === "number" ? err.code : undefined;
    // Permission gaps on the profile edge should not hide phone-level OBA / PIN status.
    if (metaCode === 10 || metaCode === 200) {
      return mapProfileRow({}, credentials, phoneMeta, syncedAt);
    }
    mapGraphFailure(parsed.status, parsed.body, "BP_FETCH_FAILED");
  }

  const dataList = Array.isArray(parsed.body.data) ? parsed.body.data : [];
  const row =
    (dataList[0] as Record<string, unknown> | undefined) ??
    (parsed.body as Record<string, unknown>);

  return mapProfileRow(row, credentials, phoneMeta, syncedAt);
}

export async function updateWhatsAppBusinessProfile(
  companyId: string,
  input: WhatsAppBusinessProfileUpdateInput,
  deps: WhatsAppBusinessProfileDeps,
): Promise<WhatsAppBusinessProfileData> {
  const credentials = await loadConnectedCredentials(companyId, deps);
  const payload = validateWhatsAppBusinessProfileUpdate(input);
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const url = `${whatsAppGraphBaseUrl(graphVersion(credentials))}/${credentials.phoneNumberId}/whatsapp_business_profile`;

  const response = await graphFetch(fetchFn, url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const parsed = await readGraphJson(response);
  if (!parsed.ok) {
    mapGraphFailure(parsed.status, parsed.body, "BP_UPDATE_FAILED");
  }

  // Confirm by re-fetching — do not trust POST alone.
  return getWhatsAppBusinessProfile(companyId, deps);
}

async function createResumableUploadSession(input: {
  appId: string;
  accessToken: string;
  apiVersion: string;
  fileLength: number;
  fileType: string;
  fileName: string;
  fetchFn: typeof fetch;
}): Promise<string> {
  const params = new URLSearchParams({
    file_length: String(input.fileLength),
    file_type: input.fileType,
    file_name: input.fileName,
  });
  const url = `${whatsAppGraphBaseUrl(input.apiVersion)}/${input.appId}/uploads?${params.toString()}`;
  const response = await graphFetch(input.fetchFn, url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const parsed = await readGraphJson(response);
  if (!parsed.ok) {
    mapGraphFailure(parsed.status, parsed.body, "BP_UPLOAD_SESSION_FAILED");
  }
  const sessionId = String(parsed.body.id ?? "").trim();
  if (!sessionId) {
    throw new WhatsAppBusinessProfileError(
      "Meta did not return an upload session id.",
      "BP_UPLOAD_SESSION_FAILED",
      502,
    );
  }
  return sessionId;
}

async function uploadResumableFileData(input: {
  sessionId: string;
  accessToken: string;
  apiVersion: string;
  bytes: Buffer;
  fetchFn: typeof fetch;
}): Promise<string> {
  // Session id is typically "upload:..." — path uses it as-is.
  const sessionPath = input.sessionId.startsWith("upload:")
    ? input.sessionId
    : `upload:${input.sessionId}`;
  const url = `${whatsAppGraphBaseUrl(input.apiVersion)}/${sessionPath}`;
  const response = await graphFetch(input.fetchFn, url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${input.accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: input.bytes,
  });
  const parsed = await readGraphJson(response);
  if (!parsed.ok) {
    mapGraphFailure(parsed.status, parsed.body, "BP_UPLOAD_FAILED");
  }
  const handle = String(parsed.body.h ?? "").trim();
  if (!handle) {
    throw new WhatsAppBusinessProfileError(
      "Meta did not return a profile_picture_handle.",
      "BP_UPLOAD_FAILED",
      502,
    );
  }
  return handle;
}

export async function updateWhatsAppBusinessProfilePicture(
  companyId: string,
  input: WhatsAppBusinessProfilePictureInput,
  deps: WhatsAppBusinessProfileDeps,
): Promise<WhatsAppBusinessProfileData & { profilePictureHandleIssued: true }> {
  const credentials = await loadConnectedCredentials(companyId, deps);
  const validated = validateProfilePictureBytes(input);
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const appId = resolveMetaAppId(deps.metaAppId);
  const apiVersion = graphVersion(credentials);

  const sessionId = await createResumableUploadSession({
    appId,
    accessToken: credentials.accessToken,
    apiVersion,
    fileLength: validated.bytes.length,
    fileType: validated.mimeType,
    fileName: validated.fileName,
    fetchFn,
  });

  const profilePictureHandle = await uploadResumableFileData({
    sessionId,
    accessToken: credentials.accessToken,
    apiVersion,
    bytes: validated.bytes,
    fetchFn,
  });

  const url = `${whatsAppGraphBaseUrl(apiVersion)}/${credentials.phoneNumberId}/whatsapp_business_profile`;
  const response = await graphFetch(fetchFn, url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      profile_picture_handle: profilePictureHandle,
    }),
  });
  const parsed = await readGraphJson(response);
  if (!parsed.ok) {
    mapGraphFailure(parsed.status, parsed.body, "BP_PICTURE_UPDATE_FAILED");
  }

  const profile = await getWhatsAppBusinessProfile(companyId, deps);
  return { ...profile, profilePictureHandleIssued: true };
}

export async function syncWhatsAppBusinessProfile(
  companyId: string,
  deps: WhatsAppBusinessProfileDeps,
): Promise<WhatsAppBusinessProfileData> {
  return getWhatsAppBusinessProfile(companyId, deps);
}
