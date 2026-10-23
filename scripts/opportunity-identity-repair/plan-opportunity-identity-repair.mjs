/**
 * Pure planners for Opportunity historical identity repair.
 * No database I/O. Callers supply snapshots; execution is a separate approved step.
 */

/** @typedef {'safe_customer_backfill_from_lead' | 'intentional_general_deal_no_change' | 'human_decision_required' | 'product_only_requires_decision'} RepairClassification */

/**
 * @typedef {object} OpportunityIdentitySnapshot
 * @property {string} opportunity_id
 * @property {string} company_id
 * @property {string | null} lead_id
 * @property {string | null} customer_id
 * @property {string | null} primary_product_id
 * @property {boolean} created_from_lead
 * @property {boolean} is_soft_deleted
 * @property {boolean} is_won
 * @property {boolean} is_lost
 * @property {string | null} stage_key
 * @property {string | null} lead_customer_id
 * @property {string | null} lead_company_id
 * @property {boolean} lead_customer_in_company
 * @property {boolean} opp_customer_in_company
 * @property {boolean} opp_product_in_company
 * @property {number} distinct_line_products
 * @property {string} opportunity_updated_at
 */

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeId(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

/**
 * UUID v4-ish / Postgres uuid text — reject abbreviated ids.
 * @param {string | null} id
 */
export function isFullUuid(id) {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Classify one open opportunity for historical identity repair.
 * Never invents customer/product from names or proximity.
 * @param {OpportunityIdentitySnapshot} row
 */
export function classifyOpportunityIdentityRepair(row) {
  const opportunityId = normalizeId(row.opportunity_id);
  const companyId = normalizeId(row.company_id);
  const leadId = normalizeId(row.lead_id);
  const customerId = normalizeId(row.customer_id);
  const productId = normalizeId(row.primary_product_id);
  const leadCustomerId = normalizeId(row.lead_customer_id);
  const leadCompanyId = normalizeId(row.lead_company_id);

  if (!isFullUuid(opportunityId) || !isFullUuid(companyId)) {
    return {
      classification: /** @type {RepairClassification} */ ("human_decision_required"),
      tenantOk: false,
      proposed: null,
      risk: "Opportunity or company id is missing or not a full UUID.",
      humanDecision:
        "Reject abbreviated IDs. Re-capture a full-id snapshot before any repair.",
      sql: null,
    };
  }

  if (row.is_soft_deleted || row.is_won || row.is_lost) {
    return {
      classification: /** @type {RepairClassification} */ ("human_decision_required"),
      tenantOk: true,
      proposed: null,
      risk: "Row is no longer an open opportunity (soft-deleted, won, or lost).",
      humanDecision: "Do not repair closed/deleted rows with this open-identity plan.",
      sql: null,
    };
  }

  // Product present, customer missing — half-scoped; never invent a customer.
  if (!customerId && productId) {
    const productTenantOk = Boolean(row.opp_product_in_company);
    return {
      classification: /** @type {RepairClassification} */ ("product_only_requires_decision"),
      tenantOk: productTenantOk,
      proposed: null,
      risk: productTenantOk
        ? "Product-scoped without customer — uniqueness cannot protect this row."
        : "primary_product_id is not an active catalog product in the opportunity company.",
      humanDecision: productTenantOk
        ? "Choose exactly one: (A) provide an authoritative same-company customer_id to assign, or (B) clear primary_product_id to leave the row intentionally unscoped. Do not invent identity."
        : "Clear or replace the invalid product reference after human review.",
      sql: null,
    };
  }

  // Customer present, product absent, no inventable product relationship.
  if (customerId && !productId) {
    const customerTenantOk = Boolean(row.opp_customer_in_company);
    if (!customerTenantOk) {
      return {
        classification: /** @type {RepairClassification} */ ("human_decision_required"),
        tenantOk: false,
        proposed: null,
        risk: "customer_id is set but does not belong to the opportunity company.",
        humanDecision: "Resolve cross-tenant customer reference before any further repair.",
        sql: null,
      };
    }
    return {
      classification: /** @type {RepairClassification} */ ("intentional_general_deal_no_change"),
      tenantOk: true,
      proposed: null,
      risk: "Low — already has tenant-valid customer; product may remain null as a general deal.",
      humanDecision:
        "No identity change. Optionally stamp metadata.identityScope=general_deal in a separate approved metadata-only pass.",
      sql: null,
    };
  }

  // Both null — try safe lead backfill only.
  if (!customerId && !productId) {
    const leadOk =
      isFullUuid(leadId) &&
      isFullUuid(leadCustomerId) &&
      isFullUuid(leadCompanyId) &&
      leadCompanyId === companyId &&
      row.lead_customer_in_company === true &&
      row.created_from_lead === true;

    if (leadOk) {
      const proposedCustomerId = leadCustomerId;
      const sql = buildSafeCustomerBackfillSql({
        opportunityId,
        companyId,
        leadId,
        expectedCustomerId: null,
        expectedPrimaryProductId: null,
        expectedUpdatedAt: String(row.opportunity_updated_at),
        setCustomerId: proposedCustomerId,
      });
      return {
        classification: /** @type {RepairClassification} */ ("safe_customer_backfill_from_lead"),
        tenantOk: true,
        proposed: {
          field: "customer_id",
          from: null,
          to: proposedCustomerId,
          source: "leads.customer_id (same company, verified)",
          alsoStampIdentityScope: "general_deal",
        },
        risk: "Low — authoritative lead.customer_id in the same company; product remains null (general deal).",
        humanDecision: "Approve customer backfill only. Do not invent a product.",
        sql,
      };
    }

    return {
      classification: /** @type {RepairClassification} */ ("human_decision_required"),
      tenantOk: true,
      proposed: null,
      risk: "No authoritative lead/customer relationship; likely legacy manual/unscoped create.",
      humanDecision:
        "Assign a same-company customer_id, convert/link a lead first, or explicitly keep as unscoped_manual. Do not infer from names.",
      sql: null,
    };
  }

  return {
    classification: /** @type {RepairClassification} */ ("human_decision_required"),
    tenantOk: true,
    proposed: null,
    risk: "Unexpected identity combination.",
    humanDecision: "Manual review required.",
    sql: null,
  };
}

/**
 * Build guarded UPDATE for a safe customer backfill.
 * Matches full IDs and expected original null identity fields + updated_at snapshot.
 * @param {{
 *   opportunityId: string,
 *   companyId: string,
 *   leadId: string,
 *   expectedCustomerId: null,
 *   expectedPrimaryProductId: null,
 *   expectedUpdatedAt: string,
 *   setCustomerId: string,
 * }} input
 */
export function buildSafeCustomerBackfillSql(input) {
  if (
    !isFullUuid(input.opportunityId) ||
    !isFullUuid(input.companyId) ||
    !isFullUuid(input.leadId) ||
    !isFullUuid(input.setCustomerId)
  ) {
    throw new Error("Refusing SQL with non-full UUID identifiers.");
  }
  const updatedAtLiteral = escapeSqlLiteral(input.expectedUpdatedAt);
  return [
    `UPDATE public.opportunities`,
    `   SET customer_id = '${input.setCustomerId}'::uuid,`,
    `       metadata = coalesce(metadata, '{}'::jsonb) || '{"identityScope":"general_deal","identityRepair":"customer_backfill_from_lead"}'::jsonb,`,
    `       updated_at = now()`,
    ` WHERE id = '${input.opportunityId}'::uuid`,
    `   AND company_id = '${input.companyId}'::uuid`,
    `   AND lead_id = '${input.leadId}'::uuid`,
    `   AND customer_id IS NULL`,
    `   AND primary_product_id IS NULL`,
    `   AND deleted_at IS NULL`,
    `   AND won_at IS NULL`,
    `   AND lost_at IS NULL`,
    `   AND updated_at = '${updatedAtLiteral}'::timestamptz`,
    `   AND EXISTS (`,
    `         SELECT 1 FROM public.leads l`,
    `          WHERE l.id = '${input.leadId}'::uuid`,
    `            AND l.company_id = '${input.companyId}'::uuid`,
    `            AND l.customer_id = '${input.setCustomerId}'::uuid`,
    `            AND l.deleted_at IS NULL`,
    `       );`,
  ].join("\n");
}

/**
 * @param {string} value
 */
export function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Normalize timestamps for snapshot equality (ISO vs pg Date object stringification).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeTimestamp(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const asString = String(value).trim();
  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return asString;
}

/**
 * Compare live row to approved snapshot; abort on drift.
 * @param {OpportunityIdentitySnapshot} approved
 * @param {OpportunityIdentitySnapshot} live
 */
export function assertSnapshotStillValid(approved, live) {
  const checks = [
    ["opportunity_id", normalizeId(approved.opportunity_id), normalizeId(live.opportunity_id)],
    ["company_id", normalizeId(approved.company_id), normalizeId(live.company_id)],
    ["lead_id", normalizeId(approved.lead_id), normalizeId(live.lead_id)],
    ["customer_id", normalizeId(approved.customer_id), normalizeId(live.customer_id)],
    [
      "primary_product_id",
      normalizeId(approved.primary_product_id),
      normalizeId(live.primary_product_id),
    ],
    [
      "opportunity_updated_at",
      normalizeTimestamp(approved.opportunity_updated_at),
      normalizeTimestamp(live.opportunity_updated_at),
    ],
    ["is_soft_deleted", approved.is_soft_deleted, live.is_soft_deleted],
    ["is_won", approved.is_won, live.is_won],
    ["is_lost", approved.is_lost, live.is_lost],
  ];
  const mismatches = [];
  for (const [field, expected, actual] of checks) {
    if (expected !== actual) {
      mismatches.push({ field, expected, actual });
    }
  }
  if (mismatches.length) {
    const err = new Error(
      `Stale snapshot for opportunity ${approved.opportunity_id}: row drifted since approval.`,
    );
    err.code = "STALE_SNAPSHOT";
    err.mismatches = mismatches;
    throw err;
  }
}

/**
 * @param {number} actual
 * @param {number} expected
 * @param {string} context
 */
export function assertAffectedRowCount(actual, expected, context) {
  if (actual !== expected) {
    const err = new Error(
      `Unexpected affected-row count for ${context}: expected ${expected}, got ${actual}.`,
    );
    err.code = "UNEXPECTED_ROW_COUNT";
    err.actual = actual;
    err.expected = expected;
    throw err;
  }
}

/**
 * Detect already-repaired safe backfill target.
 * @param {OpportunityIdentitySnapshot} approved
 * @param {OpportunityIdentitySnapshot} live
 * @param {string} proposedCustomerId
 */
export function detectAlreadyRepairedCustomerBackfill(approved, live, proposedCustomerId) {
  if (
    normalizeId(live.customer_id) === normalizeId(proposedCustomerId) &&
    normalizeId(live.primary_product_id) === null &&
    normalizeId(approved.customer_id) === null
  ) {
    return true;
  }
  return false;
}

/**
 * Detect conflicting customer already present on the live row.
 * @param {OpportunityIdentitySnapshot} live
 * @param {string} proposedCustomerId
 */
export function detectConflictingCustomerIdentity(live, proposedCustomerId) {
  const liveCustomer = normalizeId(live.customer_id);
  if (liveCustomer && liveCustomer !== normalizeId(proposedCustomerId)) {
    return {
      conflict: true,
      liveCustomerId: liveCustomer,
      proposedCustomerId: normalizeId(proposedCustomerId),
    };
  }
  return { conflict: false };
}

/**
 * Detect tenant mismatch between opportunity company and lead/customer.
 * @param {OpportunityIdentitySnapshot} row
 */
export function detectTenantMismatch(row) {
  const companyId = normalizeId(row.company_id);
  const leadCompanyId = normalizeId(row.lead_company_id);
  if (row.lead_id && leadCompanyId && leadCompanyId !== companyId) {
    return { mismatch: true, reason: "lead_company_mismatch" };
  }
  if (row.customer_id && row.opp_customer_in_company === false) {
    return { mismatch: true, reason: "customer_not_in_company" };
  }
  if (row.primary_product_id && row.opp_product_in_company === false) {
    return { mismatch: true, reason: "product_not_in_company" };
  }
  if (
    row.lead_customer_id &&
    row.lead_customer_in_company === false &&
    !row.customer_id
  ) {
    return { mismatch: true, reason: "lead_customer_not_in_company" };
  }
  return { mismatch: false };
}

/**
 * Build a full approval manifest from revalidated rows.
 * @param {{ capturedAt: string, summary: object, rows: OpportunityIdentitySnapshot[] }} capture
 */
export function buildApprovalManifest(capture) {
  const entries = capture.rows.map((row) => {
    const plan = classifyOpportunityIdentityRepair(row);
    const tenant = detectTenantMismatch(row);
    return {
      opportunity_id: row.opportunity_id,
      company_id: row.company_id,
      current: {
        lead_id: row.lead_id,
        customer_id: row.customer_id,
        primary_product_id: row.primary_product_id,
        created_from_lead: row.created_from_lead,
        stage_key: row.stage_key,
        is_soft_deleted: row.is_soft_deleted,
        is_won: row.is_won,
        is_lost: row.is_lost,
        opportunity_updated_at: row.opportunity_updated_at,
        lead_customer_id: row.lead_customer_id,
        lead_company_id: row.lead_company_id,
        lead_customer_in_company: row.lead_customer_in_company,
        opp_customer_in_company: row.opp_customer_in_company,
        opp_product_in_company: row.opp_product_in_company,
        distinct_line_products: row.distinct_line_products,
      },
      classification: plan.classification,
      proposed_change: plan.proposed,
      authoritative_source: plan.proposed?.source ?? null,
      tenant_validation: {
        ok: plan.tenantOk && !tenant.mismatch,
        detail: tenant.mismatch ? tenant.reason : "company ownership consistent with linked entities",
      },
      risk: plan.risk,
      human_decision_required: plan.humanDecision,
      exact_sql_after_approval: plan.sql,
      expected_affected_rows_if_executed: plan.sql ? 1 : 0,
    };
  });

  const byClass = {};
  for (const e of entries) {
    byClass[e.classification] = (byClass[e.classification] ?? 0) + 1;
  }

  return {
    status: "AWAITING_HUMAN_APPROVAL",
    safety: {
      historical_rows_modified: false,
      repair_sql_executed: false,
      environment: "local_only",
      note: "No UPDATE may run until a separate explicit approval is provided for this manifest snapshot.",
    },
    capturedAt: capture.capturedAt,
    summary: capture.summary,
    classification_counts: byClass,
    entries,
    execution_safeguards: {
      require_explicit_approval_token: "OPPORTUNITY_IDENTITY_REPAIR_APPROVED=1",
      require_manifest_capturedAt_match: true,
      transaction: true,
      match_full_opportunity_id: true,
      match_expected_original_field_values: true,
      verify_company_and_lead_customer_relationship: true,
      abort_on_stale_snapshot: true,
      assert_affected_row_count: true,
      re_read_all_target_ids_before_commit: true,
      refuse_non_local_database_url: true,
    },
  };
}

/**
 * Simulate applying one guarded update result for tests (no DB).
 * @param {{
 *   approved: OpportunityIdentitySnapshot,
 *   live: OpportunityIdentitySnapshot,
 *   proposedCustomerId: string,
 *   affectedRows: number,
 * }} input
 */
export function validateGuardedCustomerBackfillAttempt(input) {
  const tenant = detectTenantMismatch(input.live);
  if (tenant.mismatch) {
    const err = new Error(`Tenant mismatch: ${tenant.reason}`);
    err.code = "TENANT_MISMATCH";
    throw err;
  }

  if (detectAlreadyRepairedCustomerBackfill(input.approved, input.live, input.proposedCustomerId)) {
    return { status: "already_repaired", affectedRows: 0 };
  }

  const conflict = detectConflictingCustomerIdentity(input.live, input.proposedCustomerId);
  if (conflict.conflict) {
    const err = new Error(
      `Conflicting customer identity: live=${conflict.liveCustomerId} proposed=${conflict.proposedCustomerId}`,
    );
    err.code = "CONFLICTING_CUSTOMER";
    throw err;
  }

  assertSnapshotStillValid(input.approved, input.live);
  assertAffectedRowCount(input.affectedRows, 1, input.approved.opportunity_id);
  return { status: "ok", affectedRows: input.affectedRows };
}
