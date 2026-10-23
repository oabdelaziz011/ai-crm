import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAffectedRowCount,
  assertSnapshotStillValid,
  buildApprovalManifest,
  buildSafeCustomerBackfillSql,
  classifyOpportunityIdentityRepair,
  detectAlreadyRepairedCustomerBackfill,
  detectConflictingCustomerIdentity,
  detectTenantMismatch,
  isFullUuid,
  validateGuardedCustomerBackfillAttempt,
} from "./plan-opportunity-identity-repair.mjs";

const BASE = {
  opportunity_id: "85aba902-dad2-4b7b-a656-9acfb38c4bf5",
  company_id: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  lead_id: "88298e9e-e77e-43ef-822a-c83f2fe17790",
  customer_id: null,
  primary_product_id: null,
  created_from_lead: true,
  is_soft_deleted: false,
  is_won: false,
  is_lost: false,
  stage_key: "qualification",
  lead_customer_id: "93266133-fc2b-49c4-9939-1362a4b889e2",
  lead_company_id: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  lead_customer_in_company: true,
  opp_customer_in_company: false,
  opp_product_in_company: false,
  distinct_line_products: 0,
  opportunity_updated_at: "2026-08-09T16:06:10.427Z",
};

describe("isFullUuid", () => {
  it("rejects abbreviated ids", () => {
    assert.equal(isFullUuid("85aba902…"), false);
    assert.equal(isFullUuid("85aba902"), false);
    assert.equal(isFullUuid(BASE.opportunity_id), true);
  });
});

describe("classifyOpportunityIdentityRepair", () => {
  it("classifies safe customer backfill from verified lead", () => {
    const plan = classifyOpportunityIdentityRepair(BASE);
    assert.equal(plan.classification, "safe_customer_backfill_from_lead");
    assert.equal(plan.proposed.to, BASE.lead_customer_id);
    assert.ok(plan.sql.includes(BASE.opportunity_id));
    assert.ok(plan.sql.includes("customer_id IS NULL"));
    assert.ok(plan.sql.includes(BASE.opportunity_updated_at));
  });

  it("classifies intentional general deal with no change", () => {
    const plan = classifyOpportunityIdentityRepair({
      ...BASE,
      customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2",
      lead_customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2",
      opp_customer_in_company: true,
    });
    assert.equal(plan.classification, "intentional_general_deal_no_change");
    assert.equal(plan.sql, null);
  });

  it("classifies product-only rows as requiring a decision", () => {
    const plan = classifyOpportunityIdentityRepair({
      ...BASE,
      lead_id: null,
      lead_customer_id: null,
      lead_company_id: null,
      created_from_lead: false,
      primary_product_id: "6ec22958-25ff-4d40-827d-fb1a96756e32",
      opp_product_in_company: true,
      distinct_line_products: 1,
    });
    assert.equal(plan.classification, "product_only_requires_decision");
    assert.equal(plan.sql, null);
  });

  it("requires human decision for manual unscoped rows", () => {
    const plan = classifyOpportunityIdentityRepair({
      ...BASE,
      lead_id: null,
      lead_customer_id: null,
      lead_company_id: null,
      created_from_lead: false,
      lead_customer_in_company: false,
    });
    assert.equal(plan.classification, "human_decision_required");
    assert.equal(plan.sql, null);
  });

  it("refuses abbreviated opportunity ids", () => {
    const plan = classifyOpportunityIdentityRepair({
      ...BASE,
      opportunity_id: "85aba902",
    });
    assert.equal(plan.classification, "human_decision_required");
    assert.match(plan.risk, /full UUID/i);
  });
});

describe("buildSafeCustomerBackfillSql", () => {
  it("embeds optimistic guards and lead EXISTS check", () => {
    const sql = buildSafeCustomerBackfillSql({
      opportunityId: BASE.opportunity_id,
      companyId: BASE.company_id,
      leadId: BASE.lead_id,
      expectedCustomerId: null,
      expectedPrimaryProductId: null,
      expectedUpdatedAt: BASE.opportunity_updated_at,
      setCustomerId: BASE.lead_customer_id,
    });
    assert.match(sql, /AND customer_id IS NULL/);
    assert.match(sql, /AND primary_product_id IS NULL/);
    assert.match(sql, /AND deleted_at IS NULL/);
    assert.match(sql, /AND won_at IS NULL/);
    assert.match(sql, /AND lost_at IS NULL/);
    assert.match(sql, /AND updated_at =/);
    assert.match(sql, /EXISTS \(/);
    assert.match(sql, /l\.customer_id = '93266133-fc2b-49c4-9939-1362a4b889e2'/);
  });

  it("throws when an abbreviated id is supplied", () => {
    assert.throws(
      () =>
        buildSafeCustomerBackfillSql({
          opportunityId: "85aba902",
          companyId: BASE.company_id,
          leadId: BASE.lead_id,
          expectedCustomerId: null,
          expectedPrimaryProductId: null,
          expectedUpdatedAt: BASE.opportunity_updated_at,
          setCustomerId: BASE.lead_customer_id,
        }),
      /full UUID/,
    );
  });
});

describe("snapshot and guard validators", () => {
  it("aborts on stale snapshot (updated_at drift)", () => {
    assert.throws(
      () =>
        assertSnapshotStillValid(BASE, {
          ...BASE,
          opportunity_updated_at: "2026-10-20T00:00:00.000Z",
        }),
      (error) => error.code === "STALE_SNAPSHOT",
    );
  });

  it("treats equivalent ISO and Date timestamps as the same snapshot", () => {
    assert.doesNotThrow(() =>
      assertSnapshotStillValid(BASE, {
        ...BASE,
        opportunity_updated_at: new Date(BASE.opportunity_updated_at),
      }),
    );
  });

  it("aborts on unexpected affected-row count", () => {
    assert.throws(
      () => assertAffectedRowCount(0, 1, BASE.opportunity_id),
      (error) => error.code === "UNEXPECTED_ROW_COUNT",
    );
    assert.doesNotThrow(() => assertAffectedRowCount(1, 1, BASE.opportunity_id));
  });

  it("detects already-repaired rows", () => {
    assert.equal(
      detectAlreadyRepairedCustomerBackfill(
        BASE,
        { ...BASE, customer_id: BASE.lead_customer_id },
        BASE.lead_customer_id,
      ),
      true,
    );
    assert.equal(
      detectAlreadyRepairedCustomerBackfill(BASE, BASE, BASE.lead_customer_id),
      false,
    );
  });

  it("detects conflicting customer identity", () => {
    const conflict = detectConflictingCustomerIdentity(
      { ...BASE, customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2" },
      BASE.lead_customer_id,
    );
    assert.equal(conflict.conflict, true);
  });

  it("detects tenant mismatch", () => {
    assert.deepEqual(
      detectTenantMismatch({
        ...BASE,
        lead_company_id: "d0000010-0001-4001-8001-000000000001",
      }),
      { mismatch: true, reason: "lead_company_mismatch" },
    );
    assert.deepEqual(detectTenantMismatch(BASE), { mismatch: false });
  });

  it("validateGuardedCustomerBackfillAttempt covers success and failure modes", () => {
    assert.deepEqual(
      validateGuardedCustomerBackfillAttempt({
        approved: BASE,
        live: BASE,
        proposedCustomerId: BASE.lead_customer_id,
        affectedRows: 1,
      }),
      { status: "ok", affectedRows: 1 },
    );

    assert.deepEqual(
      validateGuardedCustomerBackfillAttempt({
        approved: BASE,
        live: {
          ...BASE,
          customer_id: BASE.lead_customer_id,
          opp_customer_in_company: true,
        },
        proposedCustomerId: BASE.lead_customer_id,
        affectedRows: 0,
      }),
      { status: "already_repaired", affectedRows: 0 },
    );

    assert.throws(
      () =>
        validateGuardedCustomerBackfillAttempt({
          approved: BASE,
          live: {
            ...BASE,
            customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2",
            opp_customer_in_company: true,
          },
          proposedCustomerId: BASE.lead_customer_id,
          affectedRows: 1,
        }),
      (error) => error.code === "CONFLICTING_CUSTOMER",
    );

    assert.throws(
      () =>
        validateGuardedCustomerBackfillAttempt({
          approved: BASE,
          live: {
            ...BASE,
            lead_company_id: "d0000010-0001-4001-8001-000000000001",
          },
          proposedCustomerId: BASE.lead_customer_id,
          affectedRows: 1,
        }),
      (error) => error.code === "TENANT_MISMATCH",
    );

    assert.throws(
      () =>
        validateGuardedCustomerBackfillAttempt({
          approved: BASE,
          live: BASE,
          proposedCustomerId: BASE.lead_customer_id,
          affectedRows: 0,
        }),
      (error) => error.code === "UNEXPECTED_ROW_COUNT",
    );
  });
});

describe("buildApprovalManifest", () => {
  it("aggregates classifications without inventing product assignments", () => {
    const manifest = buildApprovalManifest({
      capturedAt: "2026-10-20T16:02:32.844Z",
      summary: { open_total: 3 },
      rows: [
        BASE,
        {
          ...BASE,
          opportunity_id: "38d50a1b-0f60-4a8b-baca-8ddc8ed13182",
          customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2",
          lead_id: "4db7b0aa-6f8c-458b-8b9d-9950888855da",
          lead_customer_id: "01b50661-7042-42b8-ba52-2bef6fc07cb2",
          opp_customer_in_company: true,
        },
        {
          ...BASE,
          opportunity_id: "919b1f5c-9208-4bd8-8c4e-5b65883cb2ec",
          lead_id: null,
          lead_customer_id: null,
          lead_company_id: null,
          created_from_lead: false,
          primary_product_id: "6ec22958-25ff-4d40-827d-fb1a96756e32",
          opp_product_in_company: true,
          distinct_line_products: 1,
        },
      ],
    });
    assert.equal(manifest.status, "AWAITING_HUMAN_APPROVAL");
    assert.equal(manifest.safety.historical_rows_modified, false);
    assert.equal(manifest.safety.repair_sql_executed, false);
    assert.equal(manifest.classification_counts.safe_customer_backfill_from_lead, 1);
    assert.equal(manifest.classification_counts.intentional_general_deal_no_change, 1);
    assert.equal(manifest.classification_counts.product_only_requires_decision, 1);
    assert.equal(
      manifest.entries.find((e) => e.classification === "product_only_requires_decision")
        ?.exact_sql_after_approval,
      null,
    );
  });
});
