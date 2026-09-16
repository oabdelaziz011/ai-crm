/**
 * Personal email identity (profiles.email_identity) + effective signature resolution.
 * Company default remains companies.branding.email.signature.
 * Acknowledgement stays company-level (does not use this resolver).
 */
import {
  emptyEmailSignatureConfig,
  emptyEmailSignatureColors,
  hasEmailSignatureConfig,
  normalizeEmailSignatureConfig,
  renderEmailSignatureHtml,
  type EmailSignatureConfig,
} from "@workspace/channel-platform";

export type PersonalEmailIdentity = {
  senderName: string;
  senderDisplayName: string;
  signature: EmailSignatureConfig;
};

export function emptyPersonalEmailIdentity(): PersonalEmailIdentity {
  return {
    senderName: "",
    senderDisplayName: "",
    signature: emptyEmailSignatureConfig(),
  };
}

export function normalizePersonalEmailIdentity(raw: unknown): PersonalEmailIdentity {
  const empty = emptyPersonalEmailIdentity();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const row = raw as Record<string, unknown>;
  return {
    senderName: typeof row.senderName === "string" ? row.senderName.trim() : "",
    senderDisplayName:
      typeof row.senderDisplayName === "string" ? row.senderDisplayName.trim() : "",
    signature: normalizeEmailSignatureConfig(row.signature ?? row),
  };
}

export function personalEmailIdentityToPersist(doc: PersonalEmailIdentity): PersonalEmailIdentity {
  const signature = normalizeEmailSignatureConfig(doc.signature);
  return {
    senderName: doc.senderName.trim(),
    senderDisplayName: doc.senderDisplayName.trim(),
    signature: {
      name: signature.name.trim(),
      title: signature.title.trim(),
      email: signature.email.trim(),
      website: signature.website.trim(),
      colors: signature.colors ?? emptyEmailSignatureColors(),
    },
  };
}

export function resolvePersonalSenderName(input: {
  personal?: PersonalEmailIdentity | null;
  profileFullName?: string | null;
}): string {
  const configured = input.personal?.senderName?.trim() ?? "";
  if (configured) return configured;
  return String(input.profileFullName ?? "").trim();
}

export function resolvePersonalSenderDisplayName(input: {
  personal?: PersonalEmailIdentity | null;
  profileFullName?: string | null;
}): string {
  const configured = input.personal?.senderDisplayName?.trim() ?? "";
  if (configured) return configured;
  return resolvePersonalSenderName(input);
}

export type EffectiveEmailSignatureSource = "personal" | "company" | "none";

export type EffectiveEmailSignatureResult = {
  source: EffectiveEmailSignatureSource;
  signature: EmailSignatureConfig;
  html: string;
};

/**
 * personal signature → else company default → else empty.
 * Single resolver for New / Reply / Reply All / Forward composer outbound.
 */
export function resolveEffectiveEmailSignature(input: {
  personalSignature?: unknown;
  companySignature?: unknown;
}): EffectiveEmailSignatureResult {
  const personal = normalizeEmailSignatureConfig(input.personalSignature ?? null);
  if (hasEmailSignatureConfig(personal)) {
    return {
      source: "personal",
      signature: personal,
      html: renderEmailSignatureHtml(personal),
    };
  }
  const company = normalizeEmailSignatureConfig(input.companySignature ?? null);
  if (hasEmailSignatureConfig(company)) {
    return {
      source: "company",
      signature: company,
      html: renderEmailSignatureHtml(company),
    };
  }
  return {
    source: "none",
    signature: emptyEmailSignatureConfig(),
    html: "",
  };
}

export function hasPersonalEmailSignature(personal: PersonalEmailIdentity | null | undefined): boolean {
  return hasEmailSignatureConfig(personal?.signature ?? null);
}
