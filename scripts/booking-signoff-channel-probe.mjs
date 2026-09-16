import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const phoneNumberId = "1214681355059951";

const channels = await c.query(
  `select cc.id, cc.display_name, cc.is_enabled, cc.deleted_at, cc.configuration,
          ch.key as channel_key
   from public.company_channels cc
   join public.communication_channels ch on ch.id = cc.channel_id
   where cc.company_id = $1::uuid and ch.key = 'whatsapp'
   order by cc.updated_at desc`,
  [companyId],
);

const byPhone = channels.rows.filter((r) => r.configuration?.phoneNumberId === phoneNumberId);

console.log(JSON.stringify({ allWhatsappChannels: channels.rows, matchingProductionPhone: byPhone }, null, 2));
await c.end();
