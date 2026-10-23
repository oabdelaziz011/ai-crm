/**
 * LOCAL ONLY — execute approved Opportunity identity repairs.
 *
 * HARD GATES (all required):
 *   OPPORTUNITY_IDENTITY_REPAIR_APPROVED=1
 *   OPPORTUNITY_IDENTITY_REPAIR_MANIFEST_CAPTURED_AT=<exact capturedAt from APPROVAL-MANIFEST.ready.json>
 *   OPPORTUNITY_IDENTITY_REPAIR_CONFIRM_IDS=<comma-separated full opportunity UUIDs to update>
 *
 * Without every gate, this script exits without writing.
 * Uses a single transaction, optimistic snapshot checks, affected-row asserts,
 * and a final re-read of all manifest opportunity ids before COMMIT.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../../lib/db/node_modules/pg/lib/index.js";
import {
  assertAffectedRowCount,
  assertSnapshotStillValid,
  detectAlreadyRepairedCustomerBackfill,
  detectConflictingCustomerIdentity,
  detectTenantMismatch,
  isFullUuid,
} from "./plan-opportunity-identity-repair.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const manifestPath = resolve(here, "APPROVAL-MANIFEST.ready.json");

function refuse(message) {
  console.error(`[opportunity-identity-repair] REFUSED: ${message}`);
  process.exit(2);
}

if (process.env.OPPORTUNITY_IDENTITY_REPAIR_APPROVED !== "1") {
  refuse("Set OPPORTUNITY_IDENTITY_REPAIR_APPROVED=1 only after explicit human approval.");
}

const expectedCapturedAt = (process.env.OPPORTUNITY_IDENTITY_REPAIR_MANIFEST_CAPTURED_AT ?? "").trim();
if (!expectedCapturedAt) {
  refuse("OPPORTUNITY_IDENTITY_REPAIR_MANIFEST_CAPTURED_AT must match the approved manifest capturedAt.");
}

const confirmIds = new Set(
  (process.env.OPPORTUNITY_IDENTITY_REPAIR_CONFIRM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
if (!confirmIds.size) {
  refuse("OPPORTUNITY_IDENTITY_REPAIR_CONFIRM_IDS must list full opportunity UUIDs to repair.");
}
for (const id of confirmIds) {
  if (!isFullUuid(id)) refuse(`CONFIRM_IDS contains non-full UUID: ${id}`);
}

const raw = readFileSync(resolve(root, ".env.localstack"), "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
  refuse(`DATABASE_URL is not local: ${url}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.capturedAt !== expectedCapturedAt) {
  refuse(
    `Manifest capturedAt mismatch. approved=${expectedCapturedAt} file=${manifest.capturedAt}`,
  );
}

const toApply = manifest.entries.filter(
  (e) =>
    e.classification === "safe_customer_backfill_from_lead" &&
    confirmIds.has(e.opportunity_id) &&
    typeof e.exact_sql_after_approval === "string",
);
if (!toApply.length) {
  refuse("No confirmed safe_customer_backfill_from_lead entries matched CONFIRM_IDS.");
}
for (const id of confirmIds) {
  if (!toApply.some((e) => e.opportunity_id === id)) {
    refuse(`CONFIRM_IDS id is not an approved safe backfill in this manifest: ${id}`);
  }
}

const db = new pg.Client({ connectionString: url });
await db.connect();

async function loadLive(opportunityId) {
  const res = await db.query(
    `select
       o.id::text as opportunity_id,
       o.company_id::text as company_id,
       o.lead_id::text as lead_id,
       o.customer_id::text as customer_id,
       o.primary_product_id::text as primary_product_id,
       o.created_from_lead,
       o.deleted_at is not null as is_soft_deleted,
       o.won_at is not null as is_won,
       o.lost_at is not null as is_lost,
       o.updated_at as opportunity_updated_at,
       l.customer_id::text as lead_customer_id,
       l.company_id::text as lead_company_id,
       exists (
         select 1 from public.customers c
         where c.id = l.customer_id and c.company_id = o.company_id
       ) as lead_customer_in_company,
       exists (
         select 1 from public.customers c
         where c.id = o.customer_id and c.company_id = o.company_id
       ) as opp_customer_in_company,
       exists (
         select 1 from public.catalog_products p
         where p.id = o.primary_product_id
           and p.company_id = o.company_id
           and p.deleted_at is null
       ) as opp_product_in_company,
       0::int as distinct_line_products
     from public.opportunities o
     left join public.leads l on l.id = o.lead_id
     where o.id = $1`,
    [opportunityId],
  );
  if (!res.rows[0]) throw new Error(`Opportunity not found: ${opportunityId}`);
  return res.rows[0];
}

try {
  await db.query("BEGIN");

  for (const entry of toApply) {
    const approved = {
      opportunity_id: entry.opportunity_id,
      company_id: entry.company_id,
      lead_id: entry.current.lead_id,
      customer_id: entry.current.customer_id,
      primary_product_id: entry.current.primary_product_id,
      created_from_lead: entry.current.created_from_lead,
      is_soft_deleted: entry.current.is_soft_deleted,
      is_won: entry.current.is_won,
      is_lost: entry.current.is_lost,
      stage_key: entry.current.stage_key,
      lead_customer_id: entry.current.lead_customer_id,
      lead_company_id: entry.current.lead_company_id,
      lead_customer_in_company: entry.current.lead_customer_in_company,
      opp_customer_in_company: entry.current.opp_customer_in_company,
      opp_product_in_company: entry.current.opp_product_in_company,
      distinct_line_products: entry.current.distinct_line_products,
      opportunity_updated_at: entry.current.opportunity_updated_at,
    };
    const live = await loadLive(entry.opportunity_id);
    const tenant = detectTenantMismatch(live);
    if (tenant.mismatch) throw new Error(`Tenant mismatch for ${entry.opportunity_id}: ${tenant.reason}`);

    const proposed = entry.proposed_change?.to;
    if (detectAlreadyRepairedCustomerBackfill(approved, live, proposed)) {
      console.log(`[skip already_repaired] ${entry.opportunity_id}`);
      continue;
    }
    const conflict = detectConflictingCustomerIdentity(live, proposed);
    if (conflict.conflict) {
      throw new Error(
        `Conflicting customer on ${entry.opportunity_id}: live=${conflict.liveCustomerId} proposed=${conflict.proposedCustomerId}`,
      );
    }

    assertSnapshotStillValid(approved, live);
    const result = await db.query(entry.exact_sql_after_approval);
    assertAffectedRowCount(result.rowCount ?? 0, 1, entry.opportunity_id);
    console.log(`[updated] ${entry.opportunity_id} -> customer_id=${proposed}`);
  }

  // Final invariant re-read for every opportunity in the manifest before commit.
  for (const entry of manifest.entries) {
    const live = await loadLive(entry.opportunity_id);
    if (live.is_soft_deleted || live.is_won || live.is_lost) {
      throw new Error(`Invariant fail: ${entry.opportunity_id} is no longer open`);
    }
    if (entry.classification === "safe_customer_backfill_from_lead" && confirmIds.has(entry.opportunity_id)) {
      if (live.customer_id !== entry.proposed_change.to) {
        throw new Error(
          `Invariant fail: ${entry.opportunity_id} customer_id=${live.customer_id} expected=${entry.proposed_change.to}`,
        );
      }
      if (live.primary_product_id != null) {
        throw new Error(`Invariant fail: ${entry.opportunity_id} unexpectedly gained a product`);
      }
    }
  }

  await db.query("COMMIT");
  console.log("[opportunity-identity-repair] COMMIT complete");
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  console.error("[opportunity-identity-repair] ROLLBACK", error);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
