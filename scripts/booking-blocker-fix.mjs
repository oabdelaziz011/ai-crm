/**
 * Apply booking blocker fixes (P0 WA routing + P0 resource_services link).
 * Uses service-role DATABASE_URL — same data path as Scheduling Admin insertMapping.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const DISABLED_CHANNEL_ID = "12bd29d5-2da3-4bf4-b090-16755f41cd91";
const PROD_CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const PHONE_NUMBER_ID = "1214681355059951";
const SERVICE_ID = "efbad361-d193-4ea7-a211-e23113b95f5a";
const RESOURCE_ID = "1c766372-7726-4cb6-b660-b88ae85fb49c";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const report = { waRouting: null, resourceLink: null };

// ── P0: Remove production phoneNumberId from disabled AI Flow channel ──
const disabled = await c.query(
  `select id, display_name, is_enabled, configuration from public.company_channels where id = $1`,
  [DISABLED_CHANNEL_ID],
);
const cfg = disabled.rows[0]?.configuration ?? {};
if (cfg.phoneNumberId === PHONE_NUMBER_ID) {
  const nextConfig = { ...cfg };
  delete nextConfig.phoneNumberId;
  await c.query(
    `update public.company_channels set configuration = $1::jsonb, updated_at = now() where id = $2`,
    [JSON.stringify(nextConfig), DISABLED_CHANNEL_ID],
  );
  report.waRouting = { action: "removed_phoneNumberId", channelId: DISABLED_CHANNEL_ID, preserved: true };
} else {
  report.waRouting = { action: "already_clear", channelId: DISABLED_CHANNEL_ID, phoneNumberId: cfg.phoneNumberId ?? null };
}

const channels = await c.query(
  `select cc.id, cc.display_name, cc.is_enabled, cc.configuration, ch.key as channel_key
   from public.company_channels cc
   join public.communication_channels ch on ch.id = cc.channel_id
   where cc.company_id = $1::uuid and ch.key = 'whatsapp' and cc.deleted_at is null
   order by cc.display_name`,
  [COMPANY_ID],
);
const phoneOwners = channels.rows.filter((r) => r.configuration?.phoneNumberId === PHONE_NUMBER_ID);
report.waRouting.verify = {
  channels: channels.rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    is_enabled: r.is_enabled,
    phoneNumberId: r.configuration?.phoneNumberId ?? null,
  })),
  phoneOwnerCount: phoneOwners.length,
  soleOwner: phoneOwners.length === 1 && phoneOwners[0]?.id === PROD_CHANNEL_ID,
  prodEnabled: channels.rows.find((r) => r.id === PROD_CHANNEL_ID)?.is_enabled === true,
};

// ── P0: ADAM ↔ اسنان via resource_services (ResourceCapabilityService.insertMapping path) ──
const existing = await c.query(
  `select id, deleted_at from public.resource_services
   where company_id = $1::uuid and resource_id = $2::uuid and service_id = $3::uuid`,
  [COMPANY_ID, RESOURCE_ID, SERVICE_ID],
);

let actorUserId = (
  await c.query(
    `select user_id from public.profiles where company_id = $1::uuid and is_active = true order by created_at limit 1`,
    [COMPANY_ID],
  )
).rows[0]?.user_id;

if (!actorUserId) {
  actorUserId = (
    await c.query(`select id from auth.users order by created_at limit 1`)
  ).rows[0]?.id;
}

if (existing.rows[0]?.deleted_at) {
  await c.query(
    `update public.resource_services set deleted_at = null, created_by = $1 where id = $2`,
    [actorUserId, existing.rows[0].id],
  );
  report.resourceLink = { action: "restored", id: existing.rows[0].id };
} else if (!existing.rows[0]) {
  const ins = await c.query(
    `insert into public.resource_services (company_id, resource_id, service_id, created_by)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
     returning id`,
    [COMPANY_ID, RESOURCE_ID, SERVICE_ID, actorUserId],
  );
  report.resourceLink = { action: "inserted", id: ins.rows[0]?.id };
} else {
  report.resourceLink = { action: "already_active", id: existing.rows[0].id };
}

const links = await c.query(
  `select rs.id, ss.name as service_name, sr.name as resource_name, rs.deleted_at
   from public.resource_services rs
   join public.scheduling_services ss on ss.id = rs.service_id
   join public.scheduling_resources sr on sr.id = rs.resource_id
   where rs.company_id = $1::uuid and rs.service_id = $2::uuid and rs.deleted_at is null`,
  [COMPANY_ID, SERVICE_ID],
);
report.resourceLink.verify = links.rows;

console.log(JSON.stringify(report, null, 2));
await c.end();
