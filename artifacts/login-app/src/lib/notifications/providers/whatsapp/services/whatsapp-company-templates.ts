import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WHATSAPP_MESSAGE_PURPOSES,
  WHATSAPP_PURPOSE_TEMPLATE_SPECS,
  type WhatsAppMessagePurpose,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";
import {
  isMetaApprovedTemplateStatus,
  mapMetaWhatsAppTemplateStatus,
  normalizeWhatsAppTemplateLanguage,
  whatsappTemplateLanguagesMatch,
  type CompanyWhatsAppTemplateMetaStatus,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-status";
import {
  listMetaWhatsAppMessageTemplates,
  type MetaListedWhatsAppTemplate,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-client";
import {
  WhatsAppTemplateSetupError,
  WHATSAPP_TEMPLATE_SETUP_PENDING,
  isMissingCompanyWhatsAppTemplatesRelation,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-setup-error";

export type CompanyWhatsAppTemplateRecord = {
  id: string;
  companyId: string;
  purposeKey: WhatsAppMessagePurpose | string;
  languageCode: string;
  metaTemplateName: string;
  metaTemplateId: string | null;
  metaStatus: CompanyWhatsAppTemplateMetaStatus;
  category: string | null;
  recipient: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  company_id: string;
  purpose_key: string;
  language_code: string;
  meta_template_name: string;
  meta_template_id: string | null;
  meta_status: string;
  category: string | null;
  recipient: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

/** Transactional purposes only — connection_test / hello_world are separate. */
export const WHATSAPP_TRANSACTIONAL_PURPOSES: WhatsAppMessagePurpose[] =
  WHATSAPP_MESSAGE_PURPOSES.filter((p) => p !== "connection_test");

function mapRow(row: TemplateRow): CompanyWhatsAppTemplateRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    purposeKey: row.purpose_key,
    languageCode: row.language_code,
    metaTemplateName: row.meta_template_name,
    metaTemplateId: row.meta_template_id,
    metaStatus: mapMetaWhatsAppTemplateStatus(row.meta_status),
    category: row.category,
    recipient: row.recipient,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwIfMissingTable(error: { message?: string; code?: string } | null): void {
  if (error && isMissingCompanyWhatsAppTemplatesRelation(error)) {
    throw new WhatsAppTemplateSetupError(
      "WhatsApp template storage is not ready. Apply migration 483 (company_whatsapp_templates) before listing or syncing templates.",
      WHATSAPP_TEMPLATE_SETUP_PENDING,
      503,
    );
  }
}

export function matchMetaTemplateForPurpose(
  purpose: WhatsAppMessagePurpose,
  listed: MetaListedWhatsAppTemplate[],
  languageCode?: string,
): MetaListedWhatsAppTemplate | null {
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
  const wantedName = spec.recommendedMetaName.trim().toLowerCase();
  const wantedLang = normalizeWhatsAppTemplateLanguage(languageCode ?? spec.language);
  const sameName = listed.filter((t) => t.name.trim().toLowerCase() === wantedName);
  if (sameName.length === 0) return null;
  return (
    sameName.find((t) => whatsappTemplateLanguagesMatch(t.language, wantedLang)) ??
    sameName[0] ??
    null
  );
}

export async function listCompanyWhatsAppTemplates(
  client: SupabaseClient,
  companyId: string,
): Promise<CompanyWhatsAppTemplateRecord[]> {
  const scoped = companyId.trim();
  if (!scoped) return [];
  const { data, error } = await client
    .from("company_whatsapp_templates")
    .select("*")
    .eq("company_id", scoped)
    .order("purpose_key", { ascending: true });
  if (error) {
    throwIfMissingTable(error);
    throw new Error(error.message);
  }
  return ((data ?? []) as TemplateRow[]).map(mapRow);
}

/** Load company template row for a purpose (any Meta status). Soft-fails missing table → null. */
export async function resolveCompanyWhatsAppTemplateForPurpose(
  client: SupabaseClient,
  input: { companyId: string; purpose: WhatsAppMessagePurpose; languageCode?: string },
): Promise<CompanyWhatsAppTemplateRecord | null> {
  const companyId = input.companyId.trim();
  if (!companyId) return null;
  const { data, error } = await client
    .from("company_whatsapp_templates")
    .select("*")
    .eq("company_id", companyId)
    .eq("purpose_key", input.purpose);
  if (error) {
    if (isMissingCompanyWhatsAppTemplatesRelation(error)) {
      // Soft-fail: treat as not configured (never APPROVED). Callers surface clear errors.
      return null;
    }
    throw new Error(error.message);
  }
  const rows = ((data ?? []) as TemplateRow[]).map(mapRow);
  if (rows.length === 0) return null;
  if (input.languageCode) {
    const match = rows.find((r) =>
      whatsappTemplateLanguagesMatch(r.languageCode, input.languageCode!),
    );
    if (match) return match;
  }
  const approved = rows.find((r) => isMetaApprovedTemplateStatus(r.metaStatus));
  return approved ?? rows[0] ?? null;
}

export async function resolveApprovedCompanyWhatsAppTemplate(
  client: SupabaseClient,
  input: { companyId: string; purpose: WhatsAppMessagePurpose; languageCode?: string },
): Promise<CompanyWhatsAppTemplateRecord | null> {
  const row = await resolveCompanyWhatsAppTemplateForPurpose(client, input);
  if (!row) return null;
  if (!isMetaApprovedTemplateStatus(row.metaStatus)) return null;
  return row;
}

export type UpsertCompanyWhatsAppTemplateInput = {
  companyId: string;
  purposeKey: string;
  languageCode: string;
  metaTemplateName: string;
  metaTemplateId?: string | null;
  metaStatus: CompanyWhatsAppTemplateMetaStatus | string;
  category?: string | null;
  recipient?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  lastErrorCode?: string | null;
};

export async function upsertCompanyWhatsAppTemplate(
  client: SupabaseClient,
  input: UpsertCompanyWhatsAppTemplateInput,
): Promise<void> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("companyId required");
  const syncedAt = input.lastSyncedAt ?? new Date().toISOString();
  const payload = {
    company_id: companyId,
    purpose_key: input.purposeKey,
    language_code: normalizeWhatsAppTemplateLanguage(input.languageCode),
    meta_template_name: input.metaTemplateName,
    meta_template_id: input.metaTemplateId ?? null,
    meta_status: mapMetaWhatsAppTemplateStatus(input.metaStatus),
    category: input.category ?? null,
    recipient: input.recipient ?? null,
    last_synced_at: syncedAt,
    last_error: input.lastError ?? null,
    last_error_code: input.lastErrorCode ?? null,
    updated_at: syncedAt,
  };
  const { error } = await client.from("company_whatsapp_templates").upsert(payload, {
    onConflict: "company_id,purpose_key,language_code",
  });
  if (error) {
    throwIfMissingTable(error);
    throw new Error(error.message);
  }
}

export type SyncCompanyWhatsAppTemplatesResult = {
  companyId: string;
  syncedAt: string;
  listedFromMeta: number;
  upserted: number;
  notCreated: number;
  approved: number;
  templates: CompanyWhatsAppTemplateRecord[];
};

/**
 * Sync catalog purposes against Meta list for one company.
 * Does not create templates on Meta (use provision). Enforces company_id on every write.
 */
export async function syncCompanyWhatsAppTemplatesFromMeta(
  client: SupabaseClient,
  input: {
    companyId: string;
    accessToken: string;
    businessAccountId: string;
    apiVersion?: string;
    languageCode?: string;
    purposes?: WhatsAppMessagePurpose[];
    listedTemplates?: MetaListedWhatsAppTemplate[];
    fetchFn?: typeof fetch;
  },
): Promise<SyncCompanyWhatsAppTemplatesResult> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("companyId required");

  const listed =
    input.listedTemplates ??
    (await listMetaWhatsAppMessageTemplates({
      accessToken: input.accessToken,
      businessAccountId: input.businessAccountId,
      apiVersion: input.apiVersion,
      fetchFn: input.fetchFn,
    }));

  const purposes = input.purposes ?? [...WHATSAPP_MESSAGE_PURPOSES];
  const syncedAt = new Date().toISOString();
  let upserted = 0;
  let notCreated = 0;
  let approved = 0;

  for (const purpose of purposes) {
    const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
    const languageCode = normalizeWhatsAppTemplateLanguage(
      input.languageCode ?? spec.language,
    );
    const match = matchMetaTemplateForPurpose(purpose, listed, languageCode);
    const metaStatus = match
      ? mapMetaWhatsAppTemplateStatus(match.status)
      : ("NOT_CREATED" as const);
    if (metaStatus === "NOT_CREATED") notCreated += 1;
    if (isMetaApprovedTemplateStatus(metaStatus)) approved += 1;

    await upsertCompanyWhatsAppTemplate(client, {
      companyId,
      purposeKey: purpose,
      languageCode,
      metaTemplateName: match?.name ?? spec.recommendedMetaName,
      metaTemplateId: match?.id || null,
      metaStatus,
      category: match?.category ?? spec.category,
      recipient: spec.recipient,
      lastSyncedAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
    });
    upserted += 1;
  }

  const templates = await listCompanyWhatsAppTemplates(client, companyId);
  return {
    companyId,
    syncedAt,
    listedFromMeta: listed.length,
    upserted,
    notCreated,
    approved,
    templates,
  };
}

export function getWhatsAppPurposeCatalogForApi() {
  return WHATSAPP_MESSAGE_PURPOSES.map((purpose) => {
    const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
    return {
      purpose,
      recommendedMetaName: spec.recommendedMetaName,
      language: normalizeWhatsAppTemplateLanguage(spec.language),
      category: spec.category,
      recipient: spec.recipient,
      body: spec.body,
      variableKeys: spec.variableKeys,
      examples: spec.examples,
      allowsHelloWorld: spec.allowsHelloWorld,
      description: spec.description,
      transactional: purpose !== "connection_test",
    };
  });
}

/** Apply a Meta template status webhook event to one company (tenant-scoped). */
export async function applyMetaTemplateStatusUpdateForCompany(
  client: SupabaseClient,
  input: {
    companyId: string;
    metaTemplateId?: string | null;
    metaTemplateName?: string | null;
    languageCode?: string | null;
    eventOrStatus: string;
  },
): Promise<{ updated: number }> {
  const companyId = input.companyId.trim();
  if (!companyId) return { updated: 0 };
  const status = mapMetaWhatsAppTemplateStatus(input.eventOrStatus);
  const syncedAt = new Date().toISOString();

  const patch = {
    meta_status: status,
    last_synced_at: syncedAt,
    last_error: null,
    last_error_code: null,
    updated_at: syncedAt,
    ...(input.metaTemplateId ? { meta_template_id: String(input.metaTemplateId) } : {}),
  };

  if (input.metaTemplateId) {
    const { data, error } = await client
      .from("company_whatsapp_templates")
      .update(patch)
      .eq("company_id", companyId)
      .eq("meta_template_id", String(input.metaTemplateId))
      .select("id");
    if (error) {
      throwIfMissingTable(error);
      throw new Error(error.message);
    }
    return { updated: (data ?? []).length };
  }

  if (input.metaTemplateName) {
    let chain = client
      .from("company_whatsapp_templates")
      .update(patch)
      .eq("company_id", companyId)
      .eq("meta_template_name", String(input.metaTemplateName).trim());
    if (input.languageCode) {
      chain = chain.eq(
        "language_code",
        normalizeWhatsAppTemplateLanguage(String(input.languageCode)),
      );
    }
    const { data, error } = await chain.select("id");
    if (error) {
      throwIfMissingTable(error);
      throw new Error(error.message);
    }
    return { updated: (data ?? []).length };
  }

  return { updated: 0 };
}
