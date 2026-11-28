/**
 * Idempotent per-company Meta template provisioning from WHATSAPP_PURPOSE_TEMPLATE_SPECS.
 * Uses only the provided company's credentials + WABA. Never creates connection_test.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WHATSAPP_PURPOSE_TEMPLATE_SPECS,
  type WhatsAppMessagePurpose,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";
import {
  WHATSAPP_TRANSACTIONAL_PURPOSES,
  listCompanyWhatsAppTemplates,
  matchMetaTemplateForPurpose,
  syncCompanyWhatsAppTemplatesFromMeta,
  upsertCompanyWhatsAppTemplate,
  type CompanyWhatsAppTemplateRecord,
  type SyncCompanyWhatsAppTemplatesResult,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-company-templates";
import {
  createMetaWhatsAppMessageTemplate,
  listMetaWhatsAppMessageTemplates,
  WhatsAppTemplateMetaClientError,
  type MetaListedWhatsAppTemplate,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-client";
import {
  mapMetaWhatsAppTemplateStatus,
  normalizeWhatsAppTemplateLanguage,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-status";

export type ProvisionPurposeResult = {
  purpose: WhatsAppMessagePurpose;
  action: "created" | "reused" | "skipped" | "failed";
  metaTemplateName: string;
  languageCode: string;
  metaStatus: string;
  metaTemplateId: string | null;
  error: string | null;
  errorCode: string | null;
};

export type ProvisionCompanyWhatsAppTemplatesResult = {
  companyId: string;
  languageCode: string;
  listedFromMeta: number;
  created: number;
  reused: number;
  failed: number;
  purposes: ProvisionPurposeResult[];
  sync: SyncCompanyWhatsAppTemplatesResult;
  templates: CompanyWhatsAppTemplateRecord[];
};

function bodyExampleValues(purpose: WhatsAppMessagePurpose): string[] {
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
  return spec.variableKeys.map((key) => String(spec.examples[key] ?? `sample_${key}`));
}

export async function provisionCompanyWhatsAppTemplates(
  client: SupabaseClient,
  input: {
    companyId: string;
    accessToken: string;
    businessAccountId: string;
    apiVersion?: string;
    /** Company default language; Meta language code. */
    languageCode?: string;
    purposes?: WhatsAppMessagePurpose[];
    listedTemplates?: MetaListedWhatsAppTemplate[];
    fetchFn?: typeof fetch;
  },
): Promise<ProvisionCompanyWhatsAppTemplatesResult> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("companyId required");
  if (!input.accessToken.trim()) throw new Error("accessToken required");
  if (!input.businessAccountId.trim()) throw new Error("businessAccountId required");

  const languageCode = normalizeWhatsAppTemplateLanguage(input.languageCode ?? "en_US");
  const purposes = (input.purposes ?? WHATSAPP_TRANSACTIONAL_PURPOSES).filter(
    (p) => p !== "connection_test",
  );

  let listed =
    input.listedTemplates ??
    (await listMetaWhatsAppMessageTemplates({
      accessToken: input.accessToken,
      businessAccountId: input.businessAccountId,
      apiVersion: input.apiVersion,
      fetchFn: input.fetchFn,
    }));

  const purposeResults: ProvisionPurposeResult[] = [];
  let created = 0;
  let reused = 0;
  let failed = 0;
  const syncedAt = new Date().toISOString();

  for (const purpose of purposes) {
    const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
    const metaName = spec.recommendedMetaName;
    try {
      const existing = matchMetaTemplateForPurpose(purpose, listed, languageCode);
      if (existing) {
        reused += 1;
        await upsertCompanyWhatsAppTemplate(client, {
          companyId,
          purposeKey: purpose,
          languageCode: normalizeWhatsAppTemplateLanguage(existing.language || languageCode),
          metaTemplateName: existing.name,
          metaTemplateId: existing.id || null,
          metaStatus: mapMetaWhatsAppTemplateStatus(existing.status),
          category: existing.category ?? spec.category,
          recipient: spec.recipient,
          lastSyncedAt: syncedAt,
        });
        purposeResults.push({
          purpose,
          action: "reused",
          metaTemplateName: existing.name,
          languageCode: normalizeWhatsAppTemplateLanguage(existing.language || languageCode),
          metaStatus: mapMetaWhatsAppTemplateStatus(existing.status),
          metaTemplateId: existing.id || null,
          error: null,
          errorCode: null,
        });
        continue;
      }

      const createdMeta = await createMetaWhatsAppMessageTemplate({
        accessToken: input.accessToken,
        businessAccountId: input.businessAccountId,
        apiVersion: input.apiVersion,
        fetchFn: input.fetchFn,
        name: metaName,
        language: languageCode,
        category: spec.category,
        bodyText: spec.body,
        bodyExampleValues: bodyExampleValues(purpose),
        allowCategoryChange: true,
      });

      created += 1;
      await upsertCompanyWhatsAppTemplate(client, {
        companyId,
        purposeKey: purpose,
        languageCode,
        metaTemplateName: metaName,
        metaTemplateId: createdMeta.id || null,
        metaStatus: mapMetaWhatsAppTemplateStatus(createdMeta.status),
        category: createdMeta.category ?? spec.category,
        recipient: spec.recipient,
        lastSyncedAt: syncedAt,
      });
      purposeResults.push({
        purpose,
        action: "created",
        metaTemplateName: metaName,
        languageCode,
        metaStatus: mapMetaWhatsAppTemplateStatus(createdMeta.status),
        metaTemplateId: createdMeta.id || null,
        error: null,
        errorCode: null,
      });

      // Keep local list current for subsequent purpose matching / duplicate prevention.
      listed = [
        ...listed,
        {
          id: createdMeta.id,
          name: metaName,
          language: languageCode,
          status: createdMeta.status,
          category: createdMeta.category,
        },
      ];
    } catch (error) {
      // Race: Meta says already exists — re-list and reuse.
      if (
        error instanceof WhatsAppTemplateMetaClientError &&
        error.code === "meta_template_already_exists"
      ) {
        listed = await listMetaWhatsAppMessageTemplates({
          accessToken: input.accessToken,
          businessAccountId: input.businessAccountId,
          apiVersion: input.apiVersion,
          fetchFn: input.fetchFn,
        });
        const again = matchMetaTemplateForPurpose(purpose, listed, languageCode);
        if (again) {
          reused += 1;
          await upsertCompanyWhatsAppTemplate(client, {
            companyId,
            purposeKey: purpose,
            languageCode: normalizeWhatsAppTemplateLanguage(again.language || languageCode),
            metaTemplateName: again.name,
            metaTemplateId: again.id || null,
            metaStatus: mapMetaWhatsAppTemplateStatus(again.status),
            category: again.category ?? spec.category,
            recipient: spec.recipient,
            lastSyncedAt: syncedAt,
          });
          purposeResults.push({
            purpose,
            action: "reused",
            metaTemplateName: again.name,
            languageCode: normalizeWhatsAppTemplateLanguage(again.language || languageCode),
            metaStatus: mapMetaWhatsAppTemplateStatus(again.status),
            metaTemplateId: again.id || null,
            error: null,
            errorCode: null,
          });
          continue;
        }
      }

      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof WhatsAppTemplateMetaClientError
          ? error.code
          : (error as { code?: string })?.code ?? "provision_failed";
      await upsertCompanyWhatsAppTemplate(client, {
        companyId,
        purposeKey: purpose,
        languageCode,
        metaTemplateName: metaName,
        metaTemplateId: null,
        metaStatus: "NOT_CREATED",
        category: spec.category,
        recipient: spec.recipient,
        lastSyncedAt: syncedAt,
        lastError: message,
        lastErrorCode: String(errorCode),
      }).catch(() => {
        /* preserve primary error */
      });
      purposeResults.push({
        purpose,
        action: "failed",
        metaTemplateName: metaName,
        languageCode,
        metaStatus: "NOT_CREATED",
        metaTemplateId: null,
        error: message,
        errorCode: String(errorCode),
      });
    }
  }

  const sync = await syncCompanyWhatsAppTemplatesFromMeta(client, {
    companyId,
    accessToken: input.accessToken,
    businessAccountId: input.businessAccountId,
    apiVersion: input.apiVersion,
    languageCode,
    purposes: [...purposes, "connection_test"],
    listedTemplates: await listMetaWhatsAppMessageTemplates({
      accessToken: input.accessToken,
      businessAccountId: input.businessAccountId,
      apiVersion: input.apiVersion,
      fetchFn: input.fetchFn,
    }).catch(() => listed),
    fetchFn: input.fetchFn,
  });

  const templates = await listCompanyWhatsAppTemplates(client, companyId);
  return {
    companyId,
    languageCode,
    listedFromMeta: listed.length,
    created,
    reused,
    failed,
    purposes: purposeResults,
    sync,
    templates,
  };
}
