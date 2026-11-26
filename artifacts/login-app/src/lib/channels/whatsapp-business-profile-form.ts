export const WA_BP_ABOUT_MAX = 139;
export const WA_BP_ADDRESS_MAX = 256;
export const WA_BP_DESCRIPTION_MAX = 512;
export const WA_BP_EMAIL_MAX = 128;
export const WA_BP_WEBSITE_MAX = 256;
export const WA_BP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WA_BP_IMAGE_MIN_SIDE = 192;
export const WA_BP_IMAGE_MAX_SIDE = 10240;
export const WA_BP_WEBSITE_MAX_COUNT = 2;

/** Exact WhatsApp Cloud API vertical enum values (persist API value, not translated label). */
export const WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS = [
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
  (typeof WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS)[number];

/** Profile shape used by draft helpers — kept free of supabase/client imports for unit tests. */
export type WhatsAppBusinessProfileFields = {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;
};

export type WhatsAppBusinessProfileDraft = {
  about: string;
  address: string;
  description: string;
  email: string;
  website1: string;
  website2: string;
  vertical: string;
  showWebsite2: boolean;
};

export type WhatsAppBusinessProfileFieldErrors = Partial<
  Record<"about" | "email" | "website1" | "website2" | "vertical", string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSupportedVertical(value: string): value is WhatsAppBusinessProfileVertical {
  return (WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS as readonly string[]).includes(value);
}

export function profileToDraft(profile: WhatsAppBusinessProfileFields): WhatsAppBusinessProfileDraft {
  const website1 = profile.websites[0] ?? "";
  const website2 = profile.websites[1] ?? "";
  const vertical = (profile.vertical ?? "OTHER").toUpperCase();
  return {
    about: profile.about ?? "",
    address: profile.address ?? "",
    description: profile.description ?? "",
    email: profile.email ?? "",
    website1,
    website2,
    vertical: isSupportedVertical(vertical) ? vertical : "OTHER",
    showWebsite2: Boolean(website2.trim()),
  };
}

export function draftsEqual(
  a: WhatsAppBusinessProfileDraft,
  b: WhatsAppBusinessProfileDraft,
): boolean {
  return (
    a.about === b.about &&
    a.address === b.address &&
    a.description === b.description &&
    a.email === b.email &&
    a.website1 === b.website1 &&
    a.website2 === b.website2 &&
    a.vertical === b.vertical
  );
}

export function draftWebsites(draft: WhatsAppBusinessProfileDraft): string[] {
  const sites = [draft.website1.trim(), draft.website2.trim()].filter(Boolean);
  return sites.slice(0, WA_BP_WEBSITE_MAX_COUNT);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateBusinessProfileDraft(
  draft: WhatsAppBusinessProfileDraft,
): WhatsAppBusinessProfileFieldErrors {
  const errors: WhatsAppBusinessProfileFieldErrors = {};
  const about = draft.about.trim();
  if (!about) {
    errors.about = "aboutRequired";
  } else if (about.length > WA_BP_ABOUT_MAX) {
    errors.about = "aboutTooLong";
  }

  const email = draft.email.trim();
  if (email) {
    if (email.length > WA_BP_EMAIL_MAX) {
      errors.email = "emailTooLong";
    } else if (!EMAIL_RE.test(email)) {
      errors.email = "emailInvalid";
    }
  }

  const website1 = draft.website1.trim();
  if (website1) {
    if (website1.length > WA_BP_WEBSITE_MAX) {
      errors.website1 = "websiteTooLong";
    } else if (!isHttpUrl(website1)) {
      errors.website1 = "websiteInvalid";
    }
  }

  const website2 = draft.website2.trim();
  if (draft.showWebsite2 && website2) {
    if (website2.length > WA_BP_WEBSITE_MAX) {
      errors.website2 = "websiteTooLong";
    } else if (!isHttpUrl(website2)) {
      errors.website2 = "websiteInvalid";
    }
  }

  const vertical = draft.vertical.trim().toUpperCase();
  if (!isSupportedVertical(vertical)) {
    errors.vertical = "verticalInvalid";
  }

  return errors;
}

export function validateProfilePictureFileMeta(input: {
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}): "imageUnsupported" | "imageTooLarge" | "imageInvalid" | null {
  const mime = input.mimeType.toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/jpg" && mime !== "image/png") {
    return "imageUnsupported";
  }
  if (input.sizeBytes > WA_BP_IMAGE_MAX_BYTES) {
    return "imageTooLarge";
  }
  if (
    input.width < WA_BP_IMAGE_MIN_SIDE ||
    input.height < WA_BP_IMAGE_MIN_SIDE ||
    input.width > WA_BP_IMAGE_MAX_SIDE ||
    input.height > WA_BP_IMAGE_MAX_SIDE ||
    input.width !== input.height
  ) {
    return "imageInvalid";
  }
  return null;
}
