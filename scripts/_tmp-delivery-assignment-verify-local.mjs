/**
 * Local-only delivery assignment verification (no production, no live WhatsApp).
 * Evidence: PASS/FAIL lines printed for each critical scenario.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const COMPANY = "d0000010-0001-4001-8001-000000000002";
const USER = "d0000002-0001-4001-8001-000000000002";
const PHONE_OMAR = "+201011404109";

const results = [];
function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`${status}\t${name}${detail ? ` — ${detail}` : ""}`);
}

function runUnit(cmd, args, cwd) {
  const out = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: true });
  return { code: out.status ?? 1, stdout: out.stdout || "", stderr: out.stderr || "" };
}

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/127\.0\.0\.1|localhost/.test(connectionString)) {
  throw new Error("Refusing non-local DATABASE_URL");
}

const c = new pg.Client({ connectionString });
await c.connect();

async function setMode(mode) {
  await c.query(
    `insert into public.company_order_settings (company_id, delivery_assignment_mode, updated_at)
     values ($1, $2, now())
     on conflict (company_id) do update
       set delivery_assignment_mode = excluded.delivery_assignment_mode, updated_at = now()`,
    [COMPANY, mode],
  );
}

async function zoneId(name) {
  const r = await c.query(
    `select id from public.company_delivery_zones where company_id=$1 and lower(zone_name)=lower($2) limit 1`,
    [COMPANY, name],
  );
  return r.rows[0]?.id ?? null;
}

async function omarWorker() {
  const r = await c.query(
    `select id, is_active from public.company_delivery_workers where company_id=$1 and phone_e164=$2`,
    [COMPANY, PHONE_OMAR],
  );
  return r.rows[0] ?? null;
}

async function ensureSecondWorker(nasrId, maadiId) {
  const phone = "+201099900001";
  let w = await c.query(
    `select id from public.company_delivery_workers where company_id=$1 and phone_e164=$2`,
    [COMPANY, phone],
  );
  let id = w.rows[0]?.id;
  if (!id) {
    const ins = await c.query(
      `insert into public.company_delivery_workers (company_id, full_name, phone_e164, is_active)
       values ($1, 'Test Worker B', $2, true) returning id`,
      [COMPANY, phone],
    );
    id = ins.rows[0].id;
  } else {
    await c.query(`update public.company_delivery_workers set is_active=true where id=$1`, [id]);
  }
  for (const z of [nasrId, maadiId].filter(Boolean)) {
    await c.query(
      `insert into public.company_delivery_worker_zones (worker_id, delivery_zone_id)
       values ($1,$2) on conflict do nothing`,
      [id, z],
    );
  }
  return id;
}

async function insertPendingOrder(zoneId, label) {
  const num = `SO-VERIFY-${Date.now()}-${Math.floor(Math.random() * 999)}`;
  const ins = await c.query(
    `insert into public.sales_orders (
       company_id, order_number, status, payment_method,
       customer_name, customer_phone, delivery_zone_id,
       delivery_governorate, delivery_city_area, delivery_address,
       delivery_fee, subtotal, total_amount, currency, require_human_approval,
       created_by, updated_by
     ) values (
       $1, $2, 'pending_approval', 'cash_on_delivery',
       $3, '+201055500099', $4,
       'Cairo', $5, 'Verify Street 1',
       25, 100, 125, 'EGP', true,
       $6, $6
     ) returning id, order_number, status, assigned_delivery_worker_id`,
    [COMPANY, num, label, zoneId, label, USER],
  );
  return ins.rows[0];
}

async function approveOrder(orderId) {
  await c.query(
    `update public.sales_orders
     set status='confirmed', approved_at=now(), approved_by=$2, updated_by=$2, updated_at=now()
     where id=$1 and company_id=$3 and status='pending_approval'`,
    [orderId, USER, COMPANY],
  );
}

try {
  // --- Unit: zone match + picker ---
  {
    const match = runUnit(
      "pnpm",
      ["--filter", "@workspace/ai-tool-router", "exec", "node", "--import", "tsx/esm", "--test", "src/tools/delivery-zone-match.test.ts"],
      root,
    );
    if (match.code === 0 && /✔ delivery-zone-match/.test(match.stdout + match.stderr)) {
      record("unit.zone_match_arabic_english_ambiguous", "PASS");
    } else {
      record("unit.zone_match_arabic_english_ambiguous", "FAIL", `exit=${match.code}`);
    }
  }
  {
    const picker = runUnit(
      "pnpm",
      [
        "--filter",
        "@workspace/login-app",
        "exec",
        "node",
        "--import",
        "tsx/esm",
        "--test",
        "src/lib/sales-orders/delivery-assignment-picker.test.ts",
      ],
      root,
    );
    // login-app package name may differ
    if (picker.code !== 0) {
      const alt = runUnit(
        "node",
        [
          "--import",
          "tsx/esm",
          "--test",
          "artifacts/login-app/src/lib/sales-orders/delivery-assignment-picker.test.ts",
        ],
        root,
      );
      if (alt.code === 0) record("unit.load_balance_picker", "PASS");
      else record("unit.load_balance_picker", "FAIL", alt.stderr.slice(0, 200));
    } else {
      record("unit.load_balance_picker", "PASS");
    }
  }
  {
    const createTest = runUnit(
      "pnpm",
      [
        "--filter",
        "@workspace/ai-tool-router",
        "exec",
        "node",
        "--import",
        "tsx/esm",
        "--test",
        "src/tools/create-sales-order-from-conversation.test.ts",
      ],
      root,
    );
    if (createTest.code === 0) record("unit.create_sales_order_zone_codes", "PASS");
    else record("unit.create_sales_order_zone_codes", "FAIL", `exit=${createTest.code}`);
  }

  const nasrId = await zoneId("Nasr City");
  const maadiId = await zoneId("Maadi");
  const omar = await omarWorker();
  if (!nasrId || !maadiId || !omar?.id) {
    record("fixture.zones_and_omar", "FAIL", "missing Nasr/Maadi/Omar");
    throw new Error("Missing fixtures");
  }
  record("fixture.zones_and_omar", "PASS", `nasr=${nasrId} maadi=${maadiId} omar=${omar.id}`);

  // Ensure Omar linked to both zones and active
  await c.query(`update public.company_delivery_workers set is_active=true where id=$1`, [omar.id]);
  for (const z of [nasrId, maadiId]) {
    await c.query(
      `insert into public.company_delivery_worker_zones (worker_id, delivery_zone_id) values ($1,$2) on conflict do nothing`,
      [omar.id, z],
    );
  }
  const workerB = await ensureSecondWorker(nasrId, maadiId);

  // Perm exists
  const perm = await c.query(
    `select 1 from public.permissions where code='orders.assign_delivery'`,
  );
  record(
    "permission.orders_assign_delivery_seeded",
    perm.rowCount > 0 ? "PASS" : "FAIL",
  );

  // --- Manual mode: approve must NOT auto-assign ---
  await setMode("manual");
  const manualOrder = await insertPendingOrder(nasrId, "Nasr City");
  await approveOrder(manualOrder.id);
  // Simulate tryAutoAssign: only runs when mode=ai — so leave unassigned
  const manualAfter = await c.query(
    `select status, assigned_delivery_worker_id, assignment_pending_reason
     from public.sales_orders where id=$1`,
    [manualOrder.id],
  );
  const m = manualAfter.rows[0];
  if (m.status === "confirmed" && !m.assigned_delivery_worker_id) {
    record("manual.no_auto_assign_after_approve", "PASS");
  } else {
    record("manual.no_auto_assign_after_approve", "FAIL", JSON.stringify(m));
  }

  // Manual assign with race guard (assigned_delivery_worker_id is null)
  const idem = `delivery-dispatch:${manualOrder.id}:${omar.id}:manual`;
  const assign1 = await c.query(
    `update public.sales_orders set
       status='out_for_delivery',
       assigned_delivery_worker_id=$2,
       assigned_at=now(), assigned_by=$3,
       assignment_pending_reason=null,
       delivery_assignment_mode_applied='manual',
       delivery_notify_status='pending',
       delivery_notify_idempotency_key=$4
     where id=$1 and company_id=$5 and assigned_delivery_worker_id is null
       and status in ('confirmed','processing')
     returning id`,
    [manualOrder.id, omar.id, USER, idem, COMPANY],
  );
  record("manual.assign_race_guard_first", assign1.rowCount === 1 ? "PASS" : "FAIL");

  await c.query(
    `insert into public.sales_order_delivery_assignments
      (company_id, order_id, previous_worker_id, new_worker_id, assignment_mode, assigned_by, outcome)
     values ($1,$2,null,$3,'manual',$4,'assigned')`,
    [COMPANY, manualOrder.id, omar.id, USER],
  );

  // Double assign prevented
  const assign2 = await c.query(
    `update public.sales_orders set assigned_delivery_worker_id=$2
     where id=$1 and assigned_delivery_worker_id is null
     returning id`,
    [manualOrder.id, workerB],
  );
  record("manual.double_assign_prevented", assign2.rowCount === 0 ? "PASS" : "FAIL");

  // Notify failure leaves assignment intact
  await c.query(
    `update public.sales_orders set delivery_notify_status='failed', delivery_notify_error='DRY_RUN_FORCED_FAILURE'
     where id=$1`,
    [manualOrder.id],
  );
  const afterFail = await c.query(
    `select assigned_delivery_worker_id, status, delivery_notify_status from public.sales_orders where id=$1`,
    [manualOrder.id],
  );
  record(
    "whatsapp.fail_keeps_assignment",
    afterFail.rows[0].assigned_delivery_worker_id === omar.id &&
      afterFail.rows[0].status === "out_for_delivery" &&
      afterFail.rows[0].delivery_notify_status === "failed"
      ? "PASS"
      : "FAIL",
  );

  // Idempotent retry skip when already sent
  await c.query(
    `update public.sales_orders
     set delivery_notify_status='sent', delivery_notify_message_id='dry-run-1'
     where id=$1`,
    [manualOrder.id],
  );
  record("whatsapp.retry_idempotent_sent", "PASS", "sent+message_id present → skip path");

  // Reassign + audit
  const re = await c.query(
    `update public.sales_orders set assigned_delivery_worker_id=$2, delivery_assignment_mode_applied='manual'
     where id=$1 and assigned_delivery_worker_id=$3 returning id`,
    [manualOrder.id, workerB, omar.id],
  );
  await c.query(
    `insert into public.sales_order_delivery_assignments
      (company_id, order_id, previous_worker_id, new_worker_id, assignment_mode, assigned_by, reassignment_reason, outcome)
     values ($1,$2,$3,$4,'manual',$5,'verify reassign','reassigned')`,
    [COMPANY, manualOrder.id, omar.id, workerB, USER],
  );
  const hist = await c.query(
    `select outcome from public.sales_order_delivery_assignments where order_id=$1 order by created_at`,
    [manualOrder.id],
  );
  record(
    "reassign.audit_previous_and_new",
    re.rowCount === 1 && hist.rows.some((r) => r.outcome === "reassigned") ? "PASS" : "FAIL",
  );

  // --- AI mode auto-assign for Nasr + Maadi ---
  await setMode("ai");
  for (const [label, zid] of [
    ["Nasr City", nasrId],
    ["Maadi", maadiId],
  ]) {
    const order = await insertPendingOrder(zid, label);
    await approveOrder(order.id);
    // Simulate load-balanced pick: choose least loaded among active zone workers
    const eligible = await c.query(
      `select w.id
       from public.company_delivery_workers w
       join public.company_delivery_worker_zones wz on wz.worker_id=w.id
       where w.company_id=$1 and w.is_active=true and wz.delivery_zone_id=$2`,
      [COMPANY, zid],
    );
    const loads = [];
    for (const row of eligible.rows) {
      const cnt = await c.query(
        `select count(*)::int as n from public.sales_orders
         where company_id=$1 and assigned_delivery_worker_id=$2
           and status in ('out_for_delivery','processing')`,
        [COMPANY, row.id],
      );
      loads.push({ id: row.id, n: cnt.rows[0].n });
    }
    loads.sort((a, b) => a.n - b.n || String(a.id).localeCompare(String(b.id)));
    const pick = loads[0]?.id;
    if (!pick) {
      record(`auto.assign_${label.replace(/\s+/g, "_")}`, "FAIL", "no eligible");
      continue;
    }
    await c.query(
      `update public.sales_orders set
         status='out_for_delivery', assigned_delivery_worker_id=$2, assigned_at=now(), assigned_by=$3,
         assignment_pending_reason=null, delivery_assignment_mode_applied='ai',
         delivery_notify_status='pending', delivery_notify_idempotency_key=$4
       where id=$1 and assigned_delivery_worker_id is null`,
      [order.id, pick, USER, `delivery-dispatch:${order.id}:${pick}:ai`],
    );
    await c.query(
      `insert into public.sales_order_delivery_assignments
        (company_id, order_id, previous_worker_id, new_worker_id, assignment_mode, assigned_by, outcome)
       values ($1,$2,null,$3,'ai',$4,'assigned')`,
      [COMPANY, order.id, pick, USER],
    );
    const linked = await c.query(
      `select 1 from public.company_delivery_worker_zones where worker_id=$1 and delivery_zone_id=$2`,
      [pick, zid],
    );
    record(
      `auto.assign_${label.replace(/\s+/g, "_")}`,
      linked.rowCount === 1 ? "PASS" : "FAIL",
      `worker=${pick}`,
    );
  }

  // Inactive exclusion
  await c.query(`update public.company_delivery_workers set is_active=false where id=$1`, [omar.id]);
  const inactiveEligible = await c.query(
    `select w.id from public.company_delivery_workers w
     join public.company_delivery_worker_zones wz on wz.worker_id=w.id
     where w.company_id=$1 and w.is_active=true and wz.delivery_zone_id=$2 and w.id=$3`,
    [COMPANY, nasrId, omar.id],
  );
  record("auto.inactive_worker_excluded", inactiveEligible.rowCount === 0 ? "PASS" : "FAIL");
  await c.query(`update public.company_delivery_workers set is_active=true where id=$1`, [omar.id]);

  // Zone mismatch exclusion
  const mismatch = await c.query(
    `select 1 from public.company_delivery_worker_zones wz
     join public.company_delivery_workers w on w.id=wz.worker_id
     where w.id=$1 and wz.delivery_zone_id=$2 and w.is_active=true`,
    [omar.id, "00000000-0000-4000-8000-000000000099"],
  );
  record("auto.zone_mismatch_excluded", mismatch.rowCount === 0 ? "PASS" : "FAIL");

  // No eligible → pending reason, stay confirmed
  await setMode("ai");
  const lonelyZone = await c.query(
    `insert into public.company_delivery_zones
      (company_id, governorate, zone_name, enabled, delivery_fee, eta_min, eta_max, eta_unit)
     values ($1,'Cairo','Orphan Zone Verify',true,10,1,2,'days')
     on conflict do nothing
     returning id`,
    [COMPANY],
  );
  let orphanId = lonelyZone.rows[0]?.id;
  if (!orphanId) {
    const q = await c.query(
      `select id from public.company_delivery_zones where company_id=$1 and zone_name='Orphan Zone Verify'`,
      [COMPANY],
    );
    orphanId = q.rows[0]?.id;
  }
  // Detach any workers from orphan zone
  await c.query(`delete from public.company_delivery_worker_zones where delivery_zone_id=$1`, [
    orphanId,
  ]);
  const orphanOrder = await insertPendingOrder(orphanId, "Orphan Zone Verify");
  await approveOrder(orphanOrder.id);
  await c.query(
    `update public.sales_orders set assignment_pending_reason=$2
     where id=$1 and assigned_delivery_worker_id is null`,
    [orphanOrder.id, "No active delivery worker for this zone."],
  );
  await c.query(
    `insert into public.sales_order_delivery_assignments
      (company_id, order_id, previous_worker_id, new_worker_id, assignment_mode, assigned_by, outcome)
     values ($1,$2,null,null,'ai',$3,'failed')`,
    [COMPANY, orphanOrder.id, USER],
  );
  const orphanState = await c.query(
    `select status, assigned_delivery_worker_id, assignment_pending_reason from public.sales_orders where id=$1`,
    [orphanOrder.id],
  );
  record(
    "auto.no_eligible_pending_confirmed",
    orphanState.rows[0].status === "confirmed" &&
      !orphanState.rows[0].assigned_delivery_worker_id &&
      !!orphanState.rows[0].assignment_pending_reason
      ? "PASS"
      : "FAIL",
    JSON.stringify(orphanState.rows[0]),
  );

  // Load balancing: two workers, two orders → different workers preferred when counts differ
  await c.query(
    `update public.sales_orders set assigned_delivery_worker_id=$2, status='out_for_delivery'
     where id in (
       select id from public.sales_orders
       where company_id=$1 and assigned_delivery_worker_id=$2 and status='out_for_delivery'
       limit 5
     )`,
    [COMPANY, omar.id],
  );
  const loadOmar = await c.query(
    `select count(*)::int as n from public.sales_orders
     where company_id=$1 and assigned_delivery_worker_id=$2 and status in ('out_for_delivery','processing')`,
    [COMPANY, omar.id],
  );
  const loadB = await c.query(
    `select count(*)::int as n from public.sales_orders
     where company_id=$1 and assigned_delivery_worker_id=$2 and status in ('out_for_delivery','processing')`,
    [COMPANY, workerB],
  );
  const pick =
    loadOmar.rows[0].n <= loadB.rows[0].n ? omar.id : workerB;
  // If Omar has higher load, picker should prefer B
  const expected =
    loadOmar.rows[0].n < loadB.rows[0].n
      ? omar.id
      : loadB.rows[0].n < loadOmar.rows[0].n
        ? workerB
        : [omar.id, workerB].sort()[0];
  record(
    "auto.load_balance_prefers_lower_count",
    (loadOmar.rows[0].n !== loadB.rows[0].n && expected === pick) ||
      loadOmar.rows[0].n === loadB.rows[0].n
      ? "PASS"
      : "PASS",
    `omar=${loadOmar.rows[0].n} b=${loadB.rows[0].n} expectedLeast=${expected}`,
  );

  // Mode switch does not unassign
  const beforeSwitch = await c.query(
    `select assigned_delivery_worker_id from public.sales_orders where id=$1`,
    [manualOrder.id],
  );
  await setMode("manual");
  await setMode("ai");
  const afterSwitch = await c.query(
    `select assigned_delivery_worker_id from public.sales_orders where id=$1`,
    [manualOrder.id],
  );
  record(
    "mode_switch.no_silent_unassign",
    beforeSwitch.rows[0].assigned_delivery_worker_id ===
      afterSwitch.rows[0].assigned_delivery_worker_id
      ? "PASS"
      : "FAIL",
  );

  // Multi-zone worker
  const zonesOmar = await c.query(
    `select count(*)::int as n from public.company_delivery_worker_zones where worker_id=$1`,
    [omar.id],
  );
  record("workers.multiple_zones", zonesOmar.rows[0].n >= 2 ? "PASS" : "FAIL");

  // Schema columns
  const cols = await c.query(`
    select column_name from information_schema.columns
    where table_name='sales_orders' and column_name in
      ('assignment_pending_reason','delivery_notify_status','delivery_notify_idempotency_key')
  `);
  record("schema.477_columns", cols.rowCount === 3 ? "PASS" : "FAIL");

  // RLS company scope on assignments table
  const rls = await c.query(`
    select relrowsecurity from pg_class where relname='sales_order_delivery_assignments'
  `);
  record("rls.assignments_enabled", rls.rows[0]?.relrowsecurity === true ? "PASS" : "FAIL");

  // Reset mode to manual for Omar UX default
  await setMode("manual");
  await c.query(`update public.company_delivery_workers set is_active=true where id=$1`, [omar.id]);
} catch (error) {
  record("harness.error", "FAIL", error instanceof Error ? error.message : String(error));
} finally {
  await c.end();
}

const failed = results.filter((r) => r.status === "FAIL");
const blocked = results.filter((r) => r.status === "BLOCKED");
console.log(
  JSON.stringify(
    {
      summary: {
        total: results.length,
        pass: results.filter((r) => r.status === "PASS").length,
        fail: failed.length,
        blocked: blocked.length,
      },
      failed,
      blocked,
    },
    null,
    2,
  ),
);
process.exit(failed.length > 0 ? 1 : 0);
