/**
 * Apply migration 362 (profiles.preferred_theme DEFAULT 'light') and verify.
 * Does NOT UPDATE any profile rows. Disposable insert is rolled back.
 *
 * Run: node scripts/apply-362-profiles-preferred-theme-default-light.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve(process.cwd());
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "362_profiles_preferred_theme_default_light.sql";
const version = "362";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

async function columnDefault(client) {
  const r = await client.query(`
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'preferred_theme'
  `);
  return r.rows[0]?.column_default ?? null;
}

async function themeSnapshot(client) {
  const r = await client.query(`
    select
      count(*)::int as total,
      count(*) filter (where preferred_theme = 'light')::int as light_count,
      count(*) filter (where preferred_theme = 'dark')::int as dark_count,
      count(*) filter (where preferred_theme = 'system')::int as system_count,
      count(*) filter (where preferred_theme is null)::int as null_count,
      count(*) filter (
        where preferred_theme is distinct from 'light'
          and preferred_theme is distinct from 'dark'
          and preferred_theme is distinct from 'system'
          and preferred_theme is not null
      )::int as other_count,
      md5(string_agg(id::text || ':' || coalesce(preferred_theme, '<null>'), '|' order by id)) as fingerprint
    from public.profiles
  `);
  return r.rows[0];
}

async function sampleByTheme(client) {
  const r = await client.query(`
    select distinct on (preferred_theme)
      id::text as id,
      preferred_theme
    from public.profiles
    where preferred_theme in ('light', 'dark', 'system')
    order by preferred_theme, id
  `);
  return r.rows;
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const beforeDefault = await columnDefault(client);
  const beforeSnap = await themeSnapshot(client);
  const beforeSamples = await sampleByTheme(client);

  console.log("=== BEFORE APPLY ===");
  console.log("column_default:", beforeDefault);
  console.log("profile theme snapshot:", beforeSnap);
  console.log("sample rows (one per theme if present):", beforeSamples);
  console.log("\n=== INTENDED SQL ===");
  console.log(sql.trim());

  const already = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (already.rows.length > 0) {
    console.log("\nMigration 362 already recorded; skipping apply.");
  } else {
    const checksum = createHash("sha256").update(sql).digest("hex");
    await client.query("begin");
    try {
      await client.query(sql);
      // Record migration (compatible with common supabase schema_migrations shapes)
      const cols = await client.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'supabase_migrations'
          and table_name = 'schema_migrations'
      `);
      const names = new Set(cols.rows.map((r) => r.column_name));
      if (names.has("version") && names.has("name") && names.has("statements")) {
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, name, statements)
           values ($1, $2, $3::text[])`,
          [version, migrationName, [sql]],
        );
      } else if (names.has("version") && names.has("name")) {
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, name)
           values ($1, $2)`,
          [version, migrationName],
        );
      } else if (names.has("version")) {
        await client.query(
          `insert into supabase_migrations.schema_migrations (version) values ($1)`,
          [version],
        );
      } else {
        throw new Error("Unexpected schema_migrations columns: " + [...names].join(","));
      }
      await client.query("commit");
      console.log("\nApplied migration 362. checksum:", checksum.slice(0, 16) + "…");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }

  const afterDefault = await columnDefault(client);
  const afterSnap = await themeSnapshot(client);
  const afterSamples = await sampleByTheme(client);

  console.log("\n=== AFTER APPLY ===");
  console.log("column_default:", afterDefault);
  console.log("profile theme snapshot:", afterSnap);
  console.log("sample rows:", afterSamples);

  if (beforeSnap.fingerprint !== afterSnap.fingerprint) {
    throw new Error("FAIL: profiles preferred_theme fingerprint changed — rows were mutated");
  }
  console.log("\nOK: preferred_theme fingerprint unchanged (no row updates).");

  for (const sample of beforeSamples) {
    const check = await client.query(
      `select preferred_theme from public.profiles where id = $1::uuid`,
      [sample.id],
    );
    if (check.rows[0]?.preferred_theme !== sample.preferred_theme) {
      throw new Error(`FAIL: sample ${sample.id} theme changed`);
    }
  }
  console.log("OK: existing light/dark/system sample values unchanged.");

  const normalized = String(afterDefault ?? "").toLowerCase();
  if (!normalized.includes("'light'")) {
    throw new Error(`FAIL: expected default 'light', got ${afterDefault}`);
  }
  console.log("OK: column default is light.");

  // Disposable insert to prove DEFAULT applies — always rolled back.
  await client.query("begin");
  try {
    const disposableId = "00000000-0000-4000-8000-000000000362";
    // Prefer auth.users insert if required; otherwise profiles-only.
    const fk = await client.query(`
      select c.confrelid::regclass::text as ref
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = 'profiles' and c.contype = 'f'
        and pg_get_constraintdef(c.oid) ilike '%user_id%'
      limit 1
    `);
    const refsAuth = fk.rows.some((r) => String(r.ref).includes("auth.users"));

    if (refsAuth) {
      await client.query(`
        insert into auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at
        ) values (
          $1::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          'tmp-theme-default-362@example.invalid',
          crypt('tmp-disposable-362', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"tmp theme default 362"}'::jsonb,
          now(),
          now()
        )
        on conflict (id) do nothing
      `, [disposableId]);
    }

    // Bypass handle_new_user if auth insert already created a profile via trigger.
    const existing = await client.query(
      `select preferred_theme from public.profiles where id = $1::uuid`,
      [disposableId],
    );
    let theme;
    if (existing.rows.length > 0) {
      theme = existing.rows[0].preferred_theme;
      console.log("Disposable profile created via auth trigger; preferred_theme =", theme);
    } else {
      await client.query(`
        insert into public.profiles (id, user_id, email, full_name)
        values ($1::uuid, $1::uuid, 'tmp-theme-default-362@example.invalid', 'tmp theme default 362')
      `, [disposableId]);
      const got = await client.query(
        `select preferred_theme from public.profiles where id = $1::uuid`,
        [disposableId],
      );
      theme = got.rows[0]?.preferred_theme;
      console.log("Disposable profiles insert (column default); preferred_theme =", theme);
    }

    if (theme !== "light") {
      throw new Error(`FAIL: new disposable profile preferred_theme expected 'light', got ${theme}`);
    }
    console.log("OK: new-profile verification preferred_theme = light");
  } finally {
    await client.query("rollback");
    console.log("Disposable data rolled back (not committed).");
  }

  console.log("\n=== SUMMARY ===");
  console.log({
    migration: migrationName,
    beforeDefault,
    afterDefault,
    rowsUnchanged: beforeSnap.fingerprint === afterSnap.fingerprint,
    snapshot: afterSnap,
  });
} finally {
  await client.end();
}
