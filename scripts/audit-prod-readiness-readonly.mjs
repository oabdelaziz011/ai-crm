import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const plans = await c.query(
  `select code, name, is_active, max_users, price_monthly from public.plans order by code`,
);
console.log("PLANS", plans.rows);

const rlsOff = await c.query(
  `select c.relname
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
   order by 1
   limit 80`,
);
console.log("RLS_OFF", rlsOff.rows.map((r) => r.relname));

const noPolicy = await c.query(
  `select c.relname
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
     and not exists (
       select 1 from pg_policy p where p.polrelid = c.oid
     )
   order by 1
   limit 80`,
);
console.log("RLS_ON_NO_POLICIES", noPolicy.rows.map((r) => r.relname));

const metrics = await c.query(
  `select code, kind, is_active from public.usage_metric_definitions order by code`,
);
console.log("METRICS", metrics.rows);

const subStats = await c.query(
  `select status, count(*)::int as n from public.subscriptions group by 1 order by 1`,
);
console.log("SUBS", subStats.rows);

const cron = await c.query(
  `select exists(select 1 from pg_extension where extname='pg_cron') as pg_cron`,
);
console.log("PG_CRON", cron.rows[0]);

function present(name) {
  const v = merged[name];
  return Boolean(typeof v === "string" && v.trim());
}
console.log("ENV_PRESENT", {
  SUPABASE_URL: present("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY") || present("SUPABASE_SECRET_KEY"),
  STRIPE_SECRET_KEY: present("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: present("STRIPE_WEBHOOK_SECRET"),
  PAYMOB_API_KEY: present("PAYMOB_API_KEY"),
  PAYMOB_HMAC_SECRET: present("PAYMOB_HMAC_SECRET"),
  OPENAI_API_KEY: present("OPENAI_API_KEY"),
  BILLING_LIFECYCLE_WORKER_ENABLED: merged.BILLING_LIFECYCLE_WORKER_ENABLED ?? null,
  SAAS_CHECKOUT_PROVIDER: merged.SAAS_CHECKOUT_PROVIDER ?? null,
  SESSION_SECRET: present("SESSION_SECRET"),
  VITE_API_SERVER_URL: present("VITE_API_SERVER_URL"),
});

await c.end();
