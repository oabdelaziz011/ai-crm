/**
 * P1d — Supabase-backed company lead qualification settings store.
 * Always filters by company_id. Does not trust caller companyId for auth —
 * callers must enforce assertLeadCompanyAccess / leads.manage before upsert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  companyLeadQualificationSettingsToPatch,
  normalizeCompanyLeadQualificationSettings,
  resolveCompanyLeadQualificationPolicyConfig,
  toLeadQualificationPolicyConfig,
  type CompanyLeadQualificationSettings,
  type CompanyLeadQualificationSettingsPatch,
  type CompanyLeadQualificationSettingsStore,
} from "../policies/company-lead-qualification-settings.js";

type SettingsRow = {
  company_id: string;
  schema_version: number | null;
  sales_motion: string | null;
  required_evidence_fields: string[] | null;
  require_human_review_when_incomplete: boolean | null;
  require_human_review_on_conflict: boolean | null;
};

function rowToPatch(row: SettingsRow): CompanyLeadQualificationSettingsPatch {
  return {
    schemaVersion: row.schema_version ?? undefined,
    salesMotion: row.sales_motion ?? undefined,
    requiredEvidenceFields: row.required_evidence_fields ?? undefined,
    requireHumanReviewWhenIncomplete: row.require_human_review_when_incomplete ?? undefined,
    requireHumanReviewOnConflict: row.require_human_review_on_conflict ?? undefined,
  };
}

export function mapLeadQualificationSettingsRow(
  companyId: string,
  row: SettingsRow | null,
): CompanyLeadQualificationSettings | null {
  if (!row) return null;
  if (row.company_id !== companyId.trim()) {
    throw new Error("Tenant isolation violation: settings row company_id mismatch.");
  }
  const { settings } = normalizeCompanyLeadQualificationSettings(companyId, rowToPatch(row));
  return settings;
}

export function leadQualificationSettingsToRow(
  companyId: string,
  settings: CompanyLeadQualificationSettings,
  updatedBy?: string | null,
): Record<string, unknown> {
  const patch = companyLeadQualificationSettingsToPatch(settings);
  const { settings: normalized } = normalizeCompanyLeadQualificationSettings(companyId, patch);
  if (normalized.companyId !== companyId.trim()) {
    throw new Error("Tenant isolation violation: settings.companyId mismatch.");
  }
  return {
    company_id: normalized.companyId,
    schema_version: normalized.schemaVersion,
    sales_motion: normalized.salesMotion,
    required_evidence_fields: [...normalized.requiredEvidenceFields],
    require_human_review_when_incomplete: normalized.requireHumanReviewWhenIncomplete,
    require_human_review_on_conflict: normalized.requireHumanReviewOnConflict,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function createSupabaseCompanyLeadQualificationSettingsStore(
  client: SupabaseClient,
): CompanyLeadQualificationSettingsStore {
  return {
    async get(companyId: string): Promise<CompanyLeadQualificationSettings | null> {
      const key = typeof companyId === "string" ? companyId.trim() : "";
      if (!key) return null;
      const { data, error } = await client
        .from("lead_qualification_settings")
        .select(
          "company_id, schema_version, sales_motion, required_evidence_fields, require_human_review_when_incomplete, require_human_review_on_conflict",
        )
        .eq("company_id", key)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return mapLeadQualificationSettingsRow(key, (data as SettingsRow | null) ?? null);
    },

    async upsert(
      companyId: string,
      patch?: CompanyLeadQualificationSettingsPatch | null,
      options?: { updatedBy?: string | null },
    ): Promise<CompanyLeadQualificationSettings> {
      const { settings } = normalizeCompanyLeadQualificationSettings(companyId, patch);
      const payload = leadQualificationSettingsToRow(companyId, settings, options?.updatedBy);
      const { data, error } = await client
        .from("lead_qualification_settings")
        .upsert(payload, { onConflict: "company_id" })
        .select(
          "company_id, schema_version, sales_motion, required_evidence_fields, require_human_review_when_incomplete, require_human_review_on_conflict",
        )
        .single();
      if (error) throw new Error(error.message);
      const mapped = mapLeadQualificationSettingsRow(companyId, data as SettingsRow);
      if (!mapped) throw new Error("Failed to persist lead qualification settings.");
      return mapped;
    },

    async resolve(companyId: string) {
      const stored = await this.get(companyId);
      if (!stored) {
        return resolveCompanyLeadQualificationPolicyConfig(companyId, null);
      }
      return {
        settings: stored,
        policyConfig: toLeadQualificationPolicyConfig(stored),
        warnings: [] as string[],
      };
    },
  };
}
