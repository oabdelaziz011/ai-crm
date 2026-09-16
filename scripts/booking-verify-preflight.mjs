/**
 * Read-only production verification probes for Booking sign-off.
 * Step 1: WhatsApp phone routing
 * Step 2: اسنان resource_services linkage
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PHONE_NUMBER_ID = "1214681355059951";
const SERVICE_ID = "efbad361-d193-4ea7-a211-e23113b95f5a";
const FROM = "201011404109";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const channels = (
  await c.query(
    `select cc.id, cc.display_name, cc.is_enabled, cc.deleted_at, cc.configuration->>'phoneNumberId' as phone_number_id
     from public.company_channels cc
     join public.communication_channels ch on ch.id = cc.channel_id
     where cc.company_id = $1::uuid and ch.key = 'whatsapp' and cc.deleted_at is null
     order by cc.display_name`,
    [COMPANY_ID],
  )
).rows;

const owners = channels.filter((r) => r.phone_number_id === PHONE_NUMBER_ID);
const enabledOwners = owners.filter((r) => r.is_enabled === true);

const service = (
  await c.query(
    `select id, name, status, deleted_at from public.scheduling_services where id = $1`,
    [SERVICE_ID],
  )
).rows[0];

const links = (
  await c.query(
    `select rs.id, rs.resource_id, rs.service_id, rs.deleted_at,
            sr.name as resource_name, sr.status as resource_status, sr.deleted_at as resource_deleted_at,
            ss.name as service_name, ss.status as service_status
     from public.resource_services rs
     join public.scheduling_resources sr on sr.id = rs.resource_id
     join public.scheduling_services ss on ss.id = rs.service_id
     where rs.company_id = $1::uuid and rs.service_id = $2::uuid and rs.deleted_at is null`,
    [COMPANY_ID, SERVICE_ID],
  )
).rows;

const activeLinks = links.filter(
  (r) => r.resource_status === "active" && !r.resource_deleted_at && r.service_status === "active",
);

const session = (
  await c.query(
    `select conversation_id from public.channel_sessions
     where company_id = $1 and sender_external_id = $2
     order by updated_at desc limit 1`,
    [COMPANY_ID, FROM],
  )
).rows[0];

const conversation = session?.conversation_id
  ? (
      await c.query(`select id, customer_id from public.conversations where id = $1`, [
        session.conversation_id,
      ])
    ).rows[0]
  : null;

const customer = conversation?.customer_id
  ? (
      await c.query(`select id, name, phone from public.customers where id = $1`, [
        conversation.customer_id,
      ])
    ).rows[0]
  : null;

const activeBookings = conversation?.customer_id
  ? (
      await c.query(
        `select id, confirmation_number, status, start_at, service_id
         from public.scheduling_bookings
         where company_id = $1::uuid and customer_id = $2::uuid
           and deleted_at is null
           and status in ('pending','confirmed')
           and start_at > now()
         order by start_at`,
        [COMPANY_ID, conversation.customer_id],
      )
    ).rows
  : [];

console.log(
  JSON.stringify(
    {
      step1: {
        phoneNumberId: PHONE_NUMBER_ID,
        allWhatsappChannels: channels,
        owners,
        enabledOwnerCount: enabledOwners.length,
        pass: enabledOwners.length === 1 && owners.length === 1,
        soleEnabledChannelId: enabledOwners[0]?.id ?? null,
      },
      step2: {
        service,
        activeLinks,
        pass:
          service?.status === "active" &&
          !service?.deleted_at &&
          activeLinks.length >= 1,
      },
      trustedIdentity: {
        from: FROM,
        conversationId: conversation?.id ?? null,
        trustedCustomerId: conversation?.customer_id ?? null,
        customer,
        activeFutureBookings: activeBookings,
      },
    },
    null,
    2,
  ),
);

await c.end();
