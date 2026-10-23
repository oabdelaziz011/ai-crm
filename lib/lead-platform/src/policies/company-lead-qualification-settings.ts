/**
 * P1b/P1d — Company-scoped qualification policy configuration.
 *
 * Normalization is always in-process. Persistence is optional via
 * CompanyLeadQualificationSettingsStore (Supabase table lead_qualification_settings
 * from migration 425, or InMemory for tests).
 *
 * - Do not overload sales_follow_up_settings (follow-up delivery ≠ qualify rules).
 * - Do not store company policy on leads.metadata (per-lead, wrong grain).
 * - source (defaults|override) is application-derived metadata, not a DB truth column.
 */

import {
  defaultRequiredEvidenceForMotion,
  resolveLeadQualificationPolicyConfig,
  SALES_EVIDENCE_FIELD_KEYS,
  type LeadQualificationPolicyConfig,
  type SalesEvidenceFieldKey,
  type SalesMotion,
} from "./lead-qualification-policy.js";

export const COMPANY_LEAD_QUALIFICATION_SETTINGS_SCHEMA_VERSION = 1 as const;

/** Optional fields that stay off the default required list unless a company opts in. */
export const DEFAULT_OPTIONAL_EVIDENCE_FIELDS = [
  "budgetKnown",
  "decisionAuthorityKnown",
] as const satisfies readonly SalesEvidenceFieldKey[];

export type CompanyLeadQualificationSettings = {
  /** Tenant boundary — always required; never inferred across companies. */
  companyId: string;
  schemaVersion: typeof COMPANY_LEAD_QUALIFICATION_SETTINGS_SCHEMA_VERSION;
  salesMotion: SalesMotion;
  requiredEvidenceFields: readonly SalesEvidenceFieldKey[];
  requireHumanReviewWhenIncomplete: boolean;
  requireHumanReviewOnConflict: boolean;
  /**
   * `defaults` — no usable company override was supplied.
   * `override` — at least one valid company-supplied field was applied.
   * Not a persistence claim.
   */
  source: "defaults" | "override";
};

export type CompanyLeadQualificationSettingsPatch = {
  salesMotion?: unknown;
  requiredEvidenceFields?: unknown;
  requireHumanReviewWhenIncomplete?: unknown;
  requireHumanReviewOnConflict?: unknown;
  schemaVersion?: unknown;
};

export type NormalizeCompanyLeadQualificationSettingsResult = {
  settings: CompanyLeadQualificationSettings;
  /** Non-fatal issues (invalid keys dropped, bad motion replaced, etc.). */
  warnings: string[];
};

function isNonEmptyCompanyId(companyId: unknown): companyId is string {
  return typeof companyId === "string" && companyId.trim().length > 0;
}

function parseSalesMotion(value: unknown): { motion: SalesMotion | null; warning?: string } {
  if (value === undefined || value === null || value === "") {
    return { motion: null };
  }
  if (value === "b2b" || value === "b2c" || value === "mixed") {
    return { motion: value };
  }
  return {
    motion: null,
    warning: `Invalid salesMotion ${JSON.stringify(value)}; using motion default.`,
  };
}

function parseRequiredEvidenceFields(value: unknown): {
  fields: SalesEvidenceFieldKey[] | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (value === undefined || value === null) {
    return { fields: null, warnings };
  }
  if (!Array.isArray(value)) {
    warnings.push("requiredEvidenceFields must be an array; using motion defaults.");
    return { fields: null, warnings };
  }
  const allowed = new Set<string>(SALES_EVIDENCE_FIELD_KEYS);
  const fields: SalesEvidenceFieldKey[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) {
      warnings.push(`Ignoring invalid required evidence field: ${JSON.stringify(item)}`);
      continue;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    fields.push(item as SalesEvidenceFieldKey);
  }
  // Explicit empty array → treat as "use motion defaults" (never silently require nothing).
  if (fields.length === 0) {
    warnings.push("requiredEvidenceFields was empty or contained only invalid keys; using motion defaults.");
    return { fields: null, warnings };
  }
  // Deterministic order aligned with SALES_EVIDENCE_FIELD_KEYS.
  const order = new Map(SALES_EVIDENCE_FIELD_KEYS.map((k, i) => [k, i]));
  fields.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { fields, warnings };
}

function parseBoolean(value: unknown, fallback: boolean, field: string, warnings: string[]): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  warnings.push(`${field} must be boolean; using ${fallback}.`);
  return fallback;
}

/**
 * Validate and normalize a company-scoped patch into a safe settings record.
 * Always returns usable settings; never fabricates evidence — only policy knobs.
 */
export function normalizeCompanyLeadQualificationSettings(
  companyId: string,
  patch?: CompanyLeadQualificationSettingsPatch | null,
): NormalizeCompanyLeadQualificationSettingsResult {
  const warnings: string[] = [];
  if (!isNonEmptyCompanyId(companyId)) {
    throw new Error("companyId is required for lead qualification settings.");
  }
  const trimmedCompanyId = companyId.trim();

  const motionParse = parseSalesMotion(patch?.salesMotion);
  if (motionParse.warning) warnings.push(motionParse.warning);
  const salesMotion: SalesMotion = motionParse.motion ?? "b2c";

  const fieldsParse = parseRequiredEvidenceFields(patch?.requiredEvidenceFields);
  warnings.push(...fieldsParse.warnings);

  const requiredEvidenceFields = Object.freeze(
    fieldsParse.fields ?? [...defaultRequiredEvidenceForMotion(salesMotion)],
  ) as readonly SalesEvidenceFieldKey[];

  // Guard: defaults must not force budget/authority unless the company opted in.
  if (fieldsParse.fields === null) {
    for (const optional of DEFAULT_OPTIONAL_EVIDENCE_FIELDS) {
      if (requiredEvidenceFields.includes(optional)) {
        warnings.push(`Unexpected optional field ${optional} in motion defaults.`);
      }
    }
  }

  const requireHumanReviewWhenIncomplete = parseBoolean(
    patch?.requireHumanReviewWhenIncomplete,
    false,
    "requireHumanReviewWhenIncomplete",
    warnings,
  );
  const requireHumanReviewOnConflict = parseBoolean(
    patch?.requireHumanReviewOnConflict,
    true,
    "requireHumanReviewOnConflict",
    warnings,
  );

  if (
    patch?.schemaVersion !== undefined &&
    patch.schemaVersion !== null &&
    patch.schemaVersion !== COMPANY_LEAD_QUALIFICATION_SETTINGS_SCHEMA_VERSION
  ) {
    warnings.push(
      `Unsupported schemaVersion ${JSON.stringify(patch.schemaVersion)}; normalized to ${COMPANY_LEAD_QUALIFICATION_SETTINGS_SCHEMA_VERSION}.`,
    );
  }

  const hadOverride =
    patch != null &&
    (motionParse.motion != null ||
      fieldsParse.fields != null ||
      typeof patch.requireHumanReviewWhenIncomplete === "boolean" ||
      typeof patch.requireHumanReviewOnConflict === "boolean");

  const settings: CompanyLeadQualificationSettings = {
    companyId: trimmedCompanyId,
    schemaVersion: COMPANY_LEAD_QUALIFICATION_SETTINGS_SCHEMA_VERSION,
    salesMotion,
    requiredEvidenceFields,
    requireHumanReviewWhenIncomplete,
    requireHumanReviewOnConflict,
    source: hadOverride ? "override" : "defaults",
  };

  return { settings, warnings };
}

/** Map company settings → P1a policy config (drops companyId / source). */
export function toLeadQualificationPolicyConfig(
  settings: CompanyLeadQualificationSettings,
): LeadQualificationPolicyConfig {
  return resolveLeadQualificationPolicyConfig({
    salesMotion: settings.salesMotion,
    requiredEvidenceFields: settings.requiredEvidenceFields,
    requireHumanReviewWhenIncomplete: settings.requireHumanReviewWhenIncomplete,
    requireHumanReviewOnConflict: settings.requireHumanReviewOnConflict,
  });
}

/**
 * Resolve policy config for one company from an optional patch.
 * Does not load other tenants' data; companyId is mandatory.
 */
export function resolveCompanyLeadQualificationPolicyConfig(
  companyId: string,
  patch?: CompanyLeadQualificationSettingsPatch | null,
): {
  settings: CompanyLeadQualificationSettings;
  policyConfig: LeadQualificationPolicyConfig;
  warnings: string[];
} {
  const { settings, warnings } = normalizeCompanyLeadQualificationSettings(companyId, patch);
  return {
    settings,
    policyConfig: toLeadQualificationPolicyConfig(settings),
    warnings,
  };
}

/** Patch shape derived from a normalized settings record (for re-resolve / command merge). */
export function companyLeadQualificationSettingsToPatch(
  settings: CompanyLeadQualificationSettings,
): CompanyLeadQualificationSettingsPatch {
  return {
    schemaVersion: settings.schemaVersion,
    salesMotion: settings.salesMotion,
    requiredEvidenceFields: [...settings.requiredEvidenceFields],
    requireHumanReviewWhenIncomplete: settings.requireHumanReviewWhenIncomplete,
    requireHumanReviewOnConflict: settings.requireHumanReviewOnConflict,
  };
}

/**
 * Durable or in-memory company settings port.
 * Implementations must scope every read/write to the provided companyId only.
 */
export type CompanyLeadQualificationSettingsStore = {
  get(companyId: string): Promise<CompanyLeadQualificationSettings | null>;
  upsert(
    companyId: string,
    patch?: CompanyLeadQualificationSettingsPatch | null,
    options?: { updatedBy?: string | null },
  ): Promise<CompanyLeadQualificationSettings>;
  resolve(companyId: string): Promise<{
    settings: CompanyLeadQualificationSettings;
    policyConfig: LeadQualificationPolicyConfig;
    warnings: string[];
  }>;
};

/**
 * In-memory, process-local store for tests.
 * Explicitly not durable. Isolation: keys are exact companyId strings.
 */
export class InMemoryCompanyLeadQualificationSettingsStore implements CompanyLeadQualificationSettingsStore {
  private readonly byCompanyId = new Map<string, CompanyLeadQualificationSettings>();

  async get(companyId: string): Promise<CompanyLeadQualificationSettings | null> {
    if (!isNonEmptyCompanyId(companyId)) return null;
    return this.byCompanyId.get(companyId.trim()) ?? null;
  }

  /**
   * Upsert normalized settings for exactly one company.
   * Rejects writes where normalized.companyId !== requested companyId.
   */
  async upsert(
    companyId: string,
    patch?: CompanyLeadQualificationSettingsPatch | null,
    _options?: { updatedBy?: string | null },
  ): Promise<CompanyLeadQualificationSettings> {
    const { settings } = normalizeCompanyLeadQualificationSettings(companyId, patch);
    if (settings.companyId !== companyId.trim()) {
      throw new Error("Tenant isolation violation: settings.companyId mismatch.");
    }
    this.byCompanyId.set(settings.companyId, settings);
    return settings;
  }

  /** @deprecated Prefer upsert — kept for older P1b test call sites. */
  set(companyId: string, patch?: CompanyLeadQualificationSettingsPatch | null): CompanyLeadQualificationSettings {
    const { settings } = normalizeCompanyLeadQualificationSettings(companyId, patch);
    if (settings.companyId !== companyId.trim()) {
      throw new Error("Tenant isolation violation: settings.companyId mismatch.");
    }
    this.byCompanyId.set(settings.companyId, settings);
    return settings;
  }

  /** Resolve config for a company: stored override or pure defaults. Never reads another key. */
  async resolve(companyId: string): Promise<{
    settings: CompanyLeadQualificationSettings;
    policyConfig: LeadQualificationPolicyConfig;
    warnings: string[];
  }> {
    if (!isNonEmptyCompanyId(companyId)) {
      throw new Error("companyId is required for lead qualification settings.");
    }
    const key = companyId.trim();
    const stored = this.byCompanyId.get(key) ?? null;
    if (!stored) {
      return resolveCompanyLeadQualificationPolicyConfig(key, null);
    }
    if (stored.companyId !== key) {
      throw new Error("Tenant isolation violation: stored settings belong to another company.");
    }
    return {
      settings: stored,
      policyConfig: toLeadQualificationPolicyConfig(stored),
      warnings: [],
    };
  }

  clear(): void {
    this.byCompanyId.clear();
  }

  /** Test helper — list of company ids currently held (not settings payloads). */
  companyIds(): string[] {
    return [...this.byCompanyId.keys()].sort();
  }
}
