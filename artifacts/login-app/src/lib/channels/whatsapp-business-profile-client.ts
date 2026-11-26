import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";

export type WhatsAppBusinessProfile = {
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
  isOfficialBusinessAccount?: boolean | null;
  isPinEnabled?: boolean | null;
  nameStatus?: string | null;
  syncedAt: string;
};

export type WhatsAppPhoneVerificationStatus = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOfficialBusinessAccount: boolean | null;
  isPinEnabled: boolean | null;
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

export { WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS } from "@/lib/channels/whatsapp-business-profile-form";

export function isWhatsAppBusinessProfileApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}

async function buildAuthHeaders(json = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function postBusinessProfile<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(body),
  });
  let payload: T & { error?: string; message?: string; code?: string };
  try {
    payload = (await response.json()) as T & { error?: string; message?: string; code?: string };
  } catch {
    throw new Error(`WhatsApp Business Profile API returned non-JSON (${response.status})`);
  }
  if (!response.ok) {
    const err = new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
    // API error-handler puts the machine code in `error` (and optionally `code`).
    (err as Error & { code?: string }).code = payload.error ?? payload.code;
    throw err;
  }
  return payload;
}

export async function fetchWhatsAppBusinessProfile(companyId: string): Promise<WhatsAppBusinessProfile> {
  const result = await postBusinessProfile<{ profile: WhatsAppBusinessProfile }>(
    "/whatsapp/business-profile/get",
    { companyId },
  );
  return result.profile;
}

export async function fetchWhatsAppPhoneVerificationStatus(
  companyId: string,
): Promise<WhatsAppPhoneVerificationStatus> {
  const result = await postBusinessProfile<{ status: WhatsAppPhoneVerificationStatus }>(
    "/whatsapp/business-profile/status",
    { companyId },
  );
  return result.status;
}

export async function syncWhatsAppBusinessProfile(companyId: string): Promise<WhatsAppBusinessProfile> {
  const result = await postBusinessProfile<{ profile: WhatsAppBusinessProfile }>(
    "/whatsapp/business-profile/sync",
    { companyId },
  );
  return result.profile;
}

export async function updateWhatsAppBusinessProfileFields(
  companyId: string,
  input: WhatsAppBusinessProfileUpdateInput,
): Promise<WhatsAppBusinessProfile> {
  const result = await postBusinessProfile<{ profile: WhatsAppBusinessProfile }>(
    "/whatsapp/business-profile/update",
    { companyId, ...input },
  );
  return result.profile;
}

export async function uploadWhatsAppBusinessProfilePicture(input: {
  companyId: string;
  mimeType: string;
  imageBase64: string;
  fileName?: string;
}): Promise<WhatsAppBusinessProfile> {
  const result = await postBusinessProfile<{ profile: WhatsAppBusinessProfile }>(
    "/whatsapp/business-profile/picture",
    {
      companyId: input.companyId,
      mimeType: input.mimeType,
      imageBase64: input.imageBase64,
      fileName: input.fileName,
    },
  );
  return result.profile;
}
