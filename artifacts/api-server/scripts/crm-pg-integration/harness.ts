/**
 * CRM PostgreSQL integration harness (LOCAL ONLY).
 *
 * - Loads `.env.localstack` exclusively and refuses any non-local Supabase / Postgres target.
 * - Uses DEMO companies + tagged, tracked rows only (never touches unrelated business data).
 * - Cleanup runs in a single transaction with `session_replication_role = replica` and deletes
 *   ONLY tracked ids (plus rows provably derived from them: dependents of tracked ids, new default
 *   pipelines this run created for the DEMO companies, settings rows we enabled).
 *
 * SALES_FOLLOW_UP_WORKER_ALLOW_SEND is never enabled by this harness.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "../../../../lib/db/node_modules/pg/lib/index.js";

export type PgClient = InstanceType<typeof pg.Client>;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/;
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const CO_A = "d0000010-0001-4001-8001-000000000001";
export const CO_B = "d0000010-0001-4001-8001-000000000002";
export const DEMO_COMPANIES = [CO_A, CO_B] as const;
export const ASSISTANT_A = "d0000100-0001-4001-8001-000000000001";
export const ASSISTANT_B = "d0000100-0001-4001-8001-000000000002";
export const ACTOR_A = "d0000002-0001-4001-8001-000000000001";
export const ACTOR_B = "d0000002-0001-4001-8001-000000000002";

/** Unique tag for this run — embedded in every disposable name/email/thread id. */
export const TAG = `crm-pg-${Date.now()}`;

let envLoaded = false;

/** Load `.env.localstack` only (never root `.env`) and refuse non-local targets. */
export function loadLocalstackEnv(): Record<string, string> {
  const raw = readFileSync(resolve(projectRoot, ".env.localstack"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (!LOCAL_URL.test(env[key] ?? "")) throw new Error(`Refusing to run: ${key} is not local`);
  }
  if (env.DATABASE_URL && !/@(127\.0\.0\.1|localhost):54322\//.test(env.DATABASE_URL)) {
    throw new Error("Refusing to run: DATABASE_URL is not local");
  }
  Object.assign(process.env, env, { NODE_ENV: "development" });
  // Hard safety: this harness must never enable provider sends.
  delete process.env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND;
  envLoaded = true;
  return env;
}

/** Throws unless process.env and the pg target are the local Supabase stack. */
export function assertLocalCrmPgTarget(): void {
  if (!envLoaded) loadLocalstackEnv();
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (!LOCAL_URL.test(process.env[key] ?? "")) throw new Error(`Refusing to run: ${key} is not local`);
  }
  if (process.env.DATABASE_URL && !/@(127\.0\.0\.1|localhost):54322\//.test(process.env.DATABASE_URL)) {
    throw new Error("Refusing to run: DATABASE_URL is not local");
  }
  const allow = (process.env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND ?? "").trim().toLowerCase();
  if (allow === "true" || allow === "1") {
    throw new Error("Refusing to run: SALES_FOLLOW_UP_WORKER_ALLOW_SEND must stay disabled");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env.localstack");
}

export async function createCrmPgClients(): Promise<{ db: PgClient; admin: SupabaseClient; anonKey: string }> {
  assertLocalCrmPgTarget();
  const db = new pg.Client({ connectionString: LOCAL_DB_URL });
  await db.connect();
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, admin, anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "" };
}

// ---------------------------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------------------------

/** Config tables whose rows may be created for the DEMO companies as a side effect (ensureDefaultPipeline). */
const CONFIG_TABLES = ["lead_pipelines", "opportunity_pipelines", "lead_sources"] as const;

export class CrmFixtureTracker {
  readonly startedAt = new Date();
  readonly userIds = new Set<string>();
  readonly customerIds = new Set<string>();
  readonly conversationIds = new Set<string>();
  readonly leadIds = new Set<string>();
  readonly productIds = new Set<string>();
  readonly opportunityIds = new Set<string>();
  readonly jobIds = new Set<string>();
  readonly attemptIds = new Set<string>();
  readonly channelIds = new Set<string>();
  /** companyId -> prior sales_follow_up_settings row (null when none existed). */
  readonly settingsBaseline = new Map<string, Record<string, unknown> | null>();
  /** Config table -> ids that existed for DEMO companies before the run. */
  configBaseline: Map<string, Set<string>> | null = null;

  get settingsCompanyIds(): string[] {
    return [...this.settingsBaseline.keys()];
  }

  user(id: string) {
    this.userIds.add(id);
    return id;
  }
  customer(id: string) {
    this.customerIds.add(id);
    return id;
  }
  conversation(id: string) {
    this.conversationIds.add(id);
    return id;
  }
  lead(id: string) {
    this.leadIds.add(id);
    return id;
  }
  product(id: string) {
    this.productIds.add(id);
    return id;
  }
  opportunity(id: string) {
    this.opportunityIds.add(id);
    return id;
  }
  job(id: string) {
    this.jobIds.add(id);
    return id;
  }
  attempt(id: string) {
    this.attemptIds.add(id);
    return id;
  }
  channel(id: string) {
    this.channelIds.add(id);
    return id;
  }
}

/** Record which config rows already exist for the DEMO companies (so cleanup removes only new ones). */
export async function snapshotConfigBaseline(db: PgClient, tracker: CrmFixtureTracker): Promise<void> {
  const baseline = new Map<string, Set<string>>();
  for (const table of CONFIG_TABLES) {
    const exists = await db.query(`select to_regclass($1) as r`, [`public.${table}`]);
    if (!exists.rows[0].r) continue;
    const rows = await db.query(`select id::text as id from public.${table} where company_id = any($1::uuid[])`, [
      [...DEMO_COMPANIES],
    ]);
    baseline.set(table, new Set(rows.rows.map((r: { id: string }) => r.id)));
  }
  tracker.configBaseline = baseline;
}

// ---------------------------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------------------------

let seq = 0;
export function uniq(label = "x"): string {
  seq += 1;
  return `${TAG}-${label}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Digits-only unique phone (E.164-ish) so lead/customer phone lookups never collide across tests. */
export function uniquePhone(): string {
  seq += 1;
  const tail = `${Date.now()}${seq}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `+1${tail.padStart(9, "7")}`;
}

/** Disposable auth.users row (customers.user_id is NOT NULL). handle_new_user() adds a company-less profile. */
export async function createAuthUser(db: PgClient, emailTag: string, tracker?: CrmFixtureTracker): Promise<string> {
  const email = `${TAG}-${emailTag}-${Math.random().toString(36).slice(2, 8)}@crm-pg.invalid`;
  const res = await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
             '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
     returning id`,
    [email],
  );
  const id = res.rows[0].id as string;
  tracker?.user(id);
  return id;
}

export type CreateCustomerInput = {
  companyId: string;
  userId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** When false the company_id column is omitted (DB trigger decides). Default true. */
  companyScoped?: boolean;
};

export async function createCustomer(
  client: PgClient | SupabaseClient,
  input: CreateCustomerInput,
  tracker?: CrmFixtureTracker,
): Promise<string> {
  const scoped = input.companyScoped !== false;
  let id: string;
  if ("query" in client && typeof (client as PgClient).query === "function" && !("from" in client)) {
    const db = client as PgClient;
    const res = await db.query(
      `insert into public.customers (user_id, name, phone, email, company_id) values ($1, $2, $3, $4, $5) returning id`,
      [input.userId, input.name, input.phone ?? null, input.email ?? null, scoped ? input.companyId : null],
    );
    id = res.rows[0].id as string;
  } else {
    const admin = client as SupabaseClient;
    const row: Record<string, unknown> = {
      user_id: input.userId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
    };
    if (scoped) row.company_id = input.companyId;
    const { data, error } = await admin.from("customers").insert(row).select("id").single();
    if (error) throw new Error(`createCustomer failed: ${error.message}`);
    id = String(data.id);
  }
  tracker?.customer(id);
  return id;
}

export type CreateConversationInput = {
  companyId: string;
  customerId?: string | null;
  channelType: string;
  metadata?: Record<string, unknown>;
  externalThreadId?: string | null;
  assistantId: string;
  companyChannelId?: string | null;
};

export async function createConversation(
  db: PgClient,
  input: CreateConversationInput,
  tracker?: CrmFixtureTracker,
): Promise<string> {
  const res = await db.query(
    `insert into public.conversations
       (company_id, ai_assistant_id, channel_type, customer_id, metadata, external_thread_id, company_channel_id)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning id`,
    [
      input.companyId,
      input.assistantId,
      input.channelType,
      input.customerId ?? null,
      JSON.stringify({ crmPgTag: TAG, ...(input.metadata ?? {}) }),
      input.externalThreadId ?? null,
      input.companyChannelId ?? null,
    ],
  );
  const id = res.rows[0].id as string;
  tracker?.conversation(id);
  return id;
}

export async function createCatalogProduct(
  db: PgClient,
  input: { companyId: string; name: string; sku: string },
  tracker?: CrmFixtureTracker,
): Promise<string> {
  const res = await db.query(
    `insert into public.catalog_products (company_id, name, sku, metadata) values ($1, $2, $3, $4::jsonb) returning id`,
    [input.companyId, input.name, input.sku, JSON.stringify({ crmPgTag: TAG })],
  );
  const id = res.rows[0].id as string;
  tracker?.product(id);
  return id;
}

/**
 * Upsert sales_follow_up_settings (enabled, draft, whatsapp by default).
 * First call per company snapshots the prior row so cleanup restores/deletes exactly what we changed.
 */
export async function enableSalesFollowUp(
  admin: SupabaseClient,
  companyId: string,
  partial: Record<string, unknown> = {},
  tracker?: CrmFixtureTracker,
): Promise<void> {
  if (tracker && !tracker.settingsBaseline.has(companyId)) {
    const { data, error } = await admin
      .from("sales_follow_up_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(`settings baseline failed: ${error.message}`);
    tracker.settingsBaseline.set(companyId, (data as Record<string, unknown> | null) ?? null);
  }
  const { error } = await admin.from("sales_follow_up_settings").upsert(
    {
      company_id: companyId,
      enabled: true,
      approval_mode: "draft",
      channels: ["whatsapp"],
      first_delay_minutes: 60,
      subsequent_interval_minutes: [60],
      max_attempts: 2,
      updated_at: new Date().toISOString(),
      ...partial,
    },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(`enableSalesFollowUp failed: ${error.message}`);
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

type Dependent = { tbl: string; col: string; deltype: string; pk: string | null };

const ENTITY_TABLES = new Set([
  "public.conversations",
  "public.leads",
  "public.opportunities",
  "public.customers",
]);

async function dependentsOf(db: PgClient, table: string): Promise<Dependent[]> {
  const res = await db.query(
    `select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as deltype,
            (select att.attname from pg_index i join pg_attribute att on att.attrelid = i.indrelid and att.attnum = i.indkey[0]
              where i.indrelid = c.conrelid and i.indisprimary and i.indnatts = 1 limit 1) as pk
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = $1::regclass and array_length(c.conkey, 1) = 1`,
    [table],
  );
  return res.rows as Dependent[];
}

function qualified(tbl: string): string {
  return tbl.includes(".") ? tbl : `public.${tbl}`;
}

/** Delete `ids` from `table` after removing rows that depend on them (FK-graph walk; replica mode has no cascades). */
async function purge(
  db: PgClient,
  table: string,
  ids: string[],
  counts: Record<string, number>,
  depth = 0,
  seen = new Set<string>(),
): Promise<void> {
  if (!ids.length || depth > 6) return;
  const parent = qualified(table);
  for (const dep of await dependentsOf(db, parent)) {
    const depTable = qualified(dep.tbl);
    if (depTable === parent) continue;
    const key = `${depTable}.${dep.col}:${ids.length}:${ids[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (dep.deltype === "n") {
      // Audit-style "who did it" columns pointing at auth.users: our disposable users never act.
      if (parent === "auth.users") continue;
      if (ENTITY_TABLES.has(depTable)) {
        await db.query(`update ${depTable} set "${dep.col}" = null where "${dep.col}"::text = any($1::text[])`, [ids]);
        continue;
      }
    }
    const pk = dep.pk ? `"${dep.pk}"` : null;
    const res = await db.query(
      `delete from ${depTable} where "${dep.col}"::text = any($1::text[]) ${pk ? `returning ${pk}::text as pk` : ""}`,
      [ids],
    );
    if (res.rowCount) counts[depTable] = (counts[depTable] ?? 0) + res.rowCount;
    if (pk && res.rows.length) {
      await purge(db, depTable, res.rows.map((r: { pk: string }) => r.pk), counts, depth + 1, seen);
    }
  }
  const del = await db.query(`delete from ${parent} where id::text = any($1::text[])`, [ids]);
  if (del.rowCount) counts[parent] = (counts[parent] ?? 0) + del.rowCount;
}

async function ids(db: PgClient, sql: string, params: unknown[]): Promise<string[]> {
  const res = await db.query(sql, params);
  return res.rows.map((r: { id: string }) => r.id);
}

export type CleanupSummary = Record<string, number>;

/**
 * Delete ONLY tracked ids and rows derived from them. One transaction, replica role (no FK cascades),
 * then verifies nothing tracked remains. Never truncates, never touches unrelated business data.
 */
export async function cleanupTracked(db: PgClient, tracker: CrmFixtureTracker): Promise<CleanupSummary> {
  const counts: CleanupSummary = {};
  const demo = [...DEMO_COMPANIES];
  await db.query("begin");
  try {
    await db.query("set local session_replication_role = replica");

    const convs = [...tracker.conversationIds];
    const customers = [...tracker.customerIds];
    const users = [...tracker.userIds];
    const products = [...tracker.productIds];

    // Derive rows that provably belong to tracked fixtures (company-guarded).
    const leadIds = new Set(tracker.leadIds);
    for (const id of await ids(
      db,
      `select id::text as id from public.leads
        where company_id = any($1::uuid[])
          and (conversation_id::text = any($2::text[]) or customer_id::text = any($3::text[]))`,
      [demo, convs, customers],
    )) leadIds.add(id);
    for (const id of await ids(
      db,
      `select lead_id::text as id from public.conversations
        where company_id = any($1::uuid[]) and id::text = any($2::text[]) and lead_id is not null`,
      [demo, convs],
    )) leadIds.add(id);
    const leads = [...leadIds];

    const oppIds = new Set(tracker.opportunityIds);
    for (const id of await ids(
      db,
      `select id::text as id from public.opportunities
        where company_id = any($1::uuid[]) and (lead_id::text = any($2::text[]) or customer_id::text = any($3::text[]))`,
      [demo, leads, customers],
    )) oppIds.add(id);
    const opps = [...oppIds];

    // Sales follow-up rows (no FK to leads).
    const jobIds = new Set(tracker.jobIds);
    for (const id of await ids(
      db,
      `select id::text as id from public.sales_follow_up_jobs
        where company_id = any($1::uuid[]) and (lead_id::text = any($2::text[]) or conversation_id::text = any($3::text[]))`,
      [demo, leads, convs],
    )) jobIds.add(id);
    const attemptIds = new Set(tracker.attemptIds);
    for (const id of await ids(
      db,
      `select id::text as id from public.sales_follow_up_attempts
        where company_id = any($1::uuid[]) and (lead_id::text = any($2::text[]) or conversation_id::text = any($3::text[]))`,
      [demo, leads, convs],
    )) attemptIds.add(id);

    const delIds = async (table: string, list: Iterable<string>) => {
      const arr = [...list];
      if (!arr.length) return;
      const r = await db.query(`delete from ${table} where id::text = any($1::text[])`, [arr]);
      if (r.rowCount) counts[table] = (counts[table] ?? 0) + r.rowCount;
    };
    await delIds("public.sales_follow_up_jobs", jobIds);
    await delIds("public.sales_follow_up_attempts", attemptIds);

    // Entity audit / event-bus rows keyed by tracked entity ids.
    const entityIds = [...leads, ...convs, ...customers, ...opps, ...products, ...users];
    if (entityIds.length) {
      for (const tbl of ["public.audit_logs", "public.platform_event_audit"] as const) {
        const col = "entity_id";
        const r = await db.query(`delete from ${tbl} where "${col}"::text = any($1::text[])`, [entityIds]);
        if (r.rowCount) counts[tbl] = (counts[tbl] ?? 0) + r.rowCount;
      }
      // Customer-created notifications mention the tagged customer name.
      const n = await db.query(
        `delete from public.notifications
          where company_id = any($1::uuid[]) and created_at >= $2
            and (coalesce(title, '') ilike $3 or coalesce(message, '') ilike $3)`,
        [demo, tracker.startedAt.toISOString(), `%${TAG}%`],
      );
      if (n.rowCount) counts["public.notifications"] = n.rowCount;
    }

    await purge(db, "public.opportunities", opps, counts);
    await purge(db, "public.leads", leads, counts);
    await purge(db, "public.conversations", convs, counts);
    await purge(db, "public.customers", customers, counts);
    await purge(db, "public.catalog_products", products, counts);
    await purge(db, "auth.users", users, counts);

    // Optional company channels created by tests.
    await purge(db, "public.company_channels", [...tracker.channelIds], counts);

    // Settings: restore the prior row or delete the one we created.
    for (const [companyId, prior] of tracker.settingsBaseline) {
      await db.query(`delete from public.sales_follow_up_settings where company_id = $1`, [companyId]);
      if (prior) {
        await db.query(
          `insert into public.sales_follow_up_settings select * from jsonb_populate_record(null::public.sales_follow_up_settings, $1::jsonb)`,
          [JSON.stringify(prior)],
        );
      }
      counts[`settings:${companyId}`] = prior ? 1 : 0;
    }

    // Config rows created during this run for the DEMO companies (default pipelines etc.).
    if (tracker.configBaseline) {
      for (const [table, before] of tracker.configBaseline) {
        const current = await ids(db, `select id::text as id from public.${table} where company_id = any($1::uuid[])`, [demo]);
        const fresh = current.filter((id) => !before.has(id));
        if (!fresh.length) continue;
        if (table === "lead_pipelines") {
          const inUse = await db.query(
            `select count(*)::int as n from public.leads where pipeline_id::text = any($1::text[]) and deleted_at is null`,
            [fresh],
          );
          if (inUse.rows[0].n > 0) {
            counts[`kept:${table}`] = fresh.length; // someone else's lead uses it — leave config alone
            continue;
          }
        }
        if (table === "opportunity_pipelines") {
          const inUse = await db.query(
            `select count(*)::int as n from public.opportunities where pipeline_id::text = any($1::text[]) and deleted_at is null`,
            [fresh],
          );
          if (inUse.rows[0].n > 0) {
            counts[`kept:${table}`] = fresh.length;
            continue;
          }
        }
        await purge(db, `public.${table}`, fresh, counts);
      }
    }

    // Verify: nothing tracked remains.
    const leftovers: Record<string, number> = {};
    const check = async (label: string, sql: string, list: string[]) => {
      if (!list.length) return;
      const r = await db.query(sql, [list]);
      if (r.rows[0].n > 0) leftovers[label] = r.rows[0].n;
    };
    await check("leads", `select count(*)::int n from public.leads where id::text = any($1::text[])`, leads);
    await check("conversations", `select count(*)::int n from public.conversations where id::text = any($1::text[])`, convs);
    await check("customers", `select count(*)::int n from public.customers where id::text = any($1::text[])`, customers);
    await check("products", `select count(*)::int n from public.catalog_products where id::text = any($1::text[])`, products);
    await check("users", `select count(*)::int n from auth.users where id::text = any($1::text[])`, users);
    await check("profiles", `select count(*)::int n from public.profiles where user_id::text = any($1::text[])`, users);
    await check("opportunities", `select count(*)::int n from public.opportunities where id::text = any($1::text[])`, opps);
    await check("jobs", `select count(*)::int n from public.sales_follow_up_jobs where lead_id::text = any($1::text[])`, leads);
    if (Object.keys(leftovers).length) throw new Error(`cleanup left tracked rows: ${JSON.stringify(leftovers)}`);

    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  }
  return counts;
}
