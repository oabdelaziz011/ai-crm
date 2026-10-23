import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  leadQualificationSettingsToRow,
  mapLeadQualificationSettingsRow,
  createSupabaseCompanyLeadQualificationSettingsStore,
} from "./supabase-lead-qualification-settings-store.js";
import { normalizeCompanyLeadQualificationSettings } from "../policies/company-lead-qualification-settings.js";

describe("Supabase lead qualification settings store (P1d)", () => {
  it("maps a persisted row through normalize without inventing evidence", () => {
    const mapped = mapLeadQualificationSettingsRow("co-1", {
      company_id: "co-1",
      schema_version: 1,
      sales_motion: "b2b",
      required_evidence_fields: ["statedNeed", "bogus", "explicitBuyingIntent", "contactAvailable"],
      require_human_review_when_incomplete: true,
      require_human_review_on_conflict: false,
    });
    assert.ok(mapped);
    assert.equal(mapped!.salesMotion, "b2b");
    assert.equal(mapped!.requireHumanReviewWhenIncomplete, true);
    assert.equal(mapped!.requireHumanReviewOnConflict, false);
    assert.ok(!mapped!.requiredEvidenceFields.includes("bogus" as never));
    assert.ok(mapped!.requiredEvidenceFields.includes("statedNeed"));
    assert.equal(mapped!.source, "override");
  });

  it("missing row maps to null (caller uses defaults)", () => {
    assert.equal(mapLeadQualificationSettingsRow("co-1", null), null);
  });

  it("rejects row company_id mismatch", () => {
    assert.throws(
      () =>
        mapLeadQualificationSettingsRow("co-a", {
          company_id: "co-b",
          schema_version: 1,
          sales_motion: "b2c",
          required_evidence_fields: [],
          require_human_review_when_incomplete: false,
          require_human_review_on_conflict: true,
        }),
      /Tenant isolation/,
    );
  });

  it("empty required_evidence_fields becomes motion defaults via normalize", () => {
    const mapped = mapLeadQualificationSettingsRow("co-1", {
      company_id: "co-1",
      schema_version: 1,
      sales_motion: "b2c",
      required_evidence_fields: [],
      require_human_review_when_incomplete: false,
      require_human_review_on_conflict: true,
    });
    assert.ok(mapped);
    assert.ok(mapped!.requiredEvidenceFields.length > 0);
    assert.ok(mapped!.requiredEvidenceFields.includes("explicitBuyingIntent"));
  });

  it("invalid sales_motion falls back to b2c on map", () => {
    const mapped = mapLeadQualificationSettingsRow("co-1", {
      company_id: "co-1",
      schema_version: 99,
      sales_motion: "enterprise",
      required_evidence_fields: ["productInterest", "explicitBuyingIntent", "contactAvailable"],
      require_human_review_when_incomplete: false,
      require_human_review_on_conflict: true,
    });
    assert.equal(mapped!.salesMotion, "b2c");
    assert.equal(mapped!.schemaVersion, 1);
  });

  it("row payload always scopes company_id to the requested company", () => {
    const { settings } = normalizeCompanyLeadQualificationSettings("co-write", {
      salesMotion: "mixed",
      requiredEvidenceFields: ["statedNeed", "productInterest", "contactAvailable", "explicitBuyingIntent"],
    });
    const row = leadQualificationSettingsToRow("co-write", settings, "user-9");
    assert.equal(row.company_id, "co-write");
    assert.equal(row.sales_motion, "mixed");
    assert.equal(row.updated_by, "user-9");
    assert.ok(Array.isArray(row.required_evidence_fields));
  });

  it("get filters by company_id and never returns another tenant", async () => {
    const calls: Array<{ table: string; eq: string[] }> = [];
    const client = {
      from(table: string) {
        calls.push({ table, eq: [] });
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            calls[calls.length - 1]!.eq.push(`${column}=${value}`);
            return this;
          },
          maybeSingle: async () => ({
            data: {
              company_id: "company-a",
              schema_version: 1,
              sales_motion: "b2b",
              required_evidence_fields: [
                "statedNeed",
                "explicitBuyingIntent",
                "contactAvailable",
                "companyIdentified",
              ],
              require_human_review_when_incomplete: false,
              require_human_review_on_conflict: true,
            },
            error: null,
          }),
        };
      },
    };
    const store = createSupabaseCompanyLeadQualificationSettingsStore(client as never);
    const settings = await store.get("company-a");
    assert.equal(settings?.companyId, "company-a");
    assert.equal(settings?.salesMotion, "b2b");
    assert.equal(calls[0]?.table, "lead_qualification_settings");
    assert.ok(calls[0]?.eq.includes("company_id=company-a"));
  });

  it("upsert payload uses onConflict company_id", async () => {
    let upsertArgs: { onConflict?: string } | null = null;
    const client = {
      from() {
        return {
          upsert(payload: Record<string, unknown>, opts: { onConflict?: string }) {
            upsertArgs = opts;
            assert.equal(payload.company_id, "co-up");
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      company_id: "co-up",
                      schema_version: 1,
                      sales_motion: "b2c",
                      required_evidence_fields: [
                        "productInterest",
                        "explicitBuyingIntent",
                        "contactAvailable",
                      ],
                      require_human_review_when_incomplete: false,
                      require_human_review_on_conflict: true,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };
    const store = createSupabaseCompanyLeadQualificationSettingsStore(client as never);
    const saved = await store.upsert("co-up", { salesMotion: "b2c" }, { updatedBy: "u1" });
    assert.equal(saved.companyId, "co-up");
    assert.equal(upsertArgs?.onConflict, "company_id");
  });
});
