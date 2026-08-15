import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const co = (
    await client.query(`select id from public.companies order by created_at desc limit 1`)
  ).rows[0];
  if (!co) throw new Error("no company");
  const id = co.id;

  await client.query(
    `update public.company_feature_overrides
     set is_active = false
     where company_id = $1 and feature_code = 'whatsapp_channel' and is_active = true
       and reason = 'smoke'`,
    [id],
  );

  const core = await client.query(`select public.is_feature_enabled($1, $2) as e`, [
    id,
    "core_crm",
  ]);
  const waNo = await client.query(`select public.is_feature_enabled($1, $2) as e`, [
    id,
    "whatsapp_channel",
  ]);

  await client.query(
    `insert into public.company_feature_overrides (
      company_id, feature_code, override_state, reason, starts_at, expires_at, source, notes, is_active
    ) values ($1, 'whatsapp_channel', 'enabled', 'smoke', now() - interval '1 day', null, 'contract', 'smoke', true)`,
    [id],
  );

  const waYes = await client.query(`select public.is_feature_enabled($1, $2) as e`, [
    id,
    "whatsapp_channel",
  ]);

  await client.query(
    `update public.company_feature_overrides
     set is_active = false
     where company_id = $1 and feature_code = 'whatsapp_channel' and reason = 'smoke'`,
    [id],
  );

  const state = await client.query(`select public.get_company_access_state($1) as s`, [id]);

  console.log(
    JSON.stringify(
      {
        companyId: id,
        core: core.rows[0].e,
        whatsappWithoutGrant: waNo.rows[0].e,
        whatsappWithContract: waYes.rows[0].e,
        accessState: state.rows[0].s,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
