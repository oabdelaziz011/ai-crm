/**
 * Idempotent repair for migration 171 partial apply.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);

async function main() {
  const env = loadSupabaseEnv(root);
  const databaseUrl = env.DATABASE_URL!;
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const projectRef = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
  const pooler = `postgresql://postgres.${projectRef}:${parsed.password}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`;
  const openAiKey = (env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();

  const sql = readFileSync(resolve(root, "supabase/migrations/171_platform_ai_provider.sql"), "utf8");
  const client = new pg.Client({ connectionString: pooler, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Applying migration 171 (idempotent)...");
  try {
    await client.query(sql);
    console.log("Migration SQL applied.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Migration note:", message.slice(0, 240));
  }

  const settingsSql = readFileSync(resolve(root, "supabase/migrations/172_platform_ai_crypto_settings.sql"), "utf8");
  await client.query(settingsSql);
  await client.query(`
    create extension if not exists pgcrypto with schema extensions;
    create or replace function public.platform_ai_decrypt_key(p_encrypted bytea)
    returns text language plpgsql security definer set search_path = public, extensions as $$
    declare v_secret text;
    begin
      v_secret := public.platform_ai_crypto_secret();
      if v_secret is null or length(trim(v_secret)) = 0 then
        raise exception 'platform crypto secret is not configured';
      end if;
      return pgp_sym_decrypt(p_encrypted, v_secret);
    end; $$;
  `);

  if (openAiKey) {
    const escaped = openAiKey.replace(/'/g, "''");
    await client.query(`
      insert into public.platform_ai_settings(key, value, updated_at)
      values ('crypto_secret', '${escaped}', now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    `);
    await client.query(`
      do $$
      declare
        v_provider_id uuid;
        v_encrypted bytea;
        v_secret text;
      begin
        select id into v_provider_id from public.platform_ai_providers where provider_key = 'openai' limit 1;
        v_secret := public.platform_ai_crypto_secret();
        if v_provider_id is null or v_secret is null then
          raise notice 'provider or secret missing';
          return;
        end if;
        update public.platform_ai_provider_keys set is_active = false where provider_id = v_provider_id and is_active = true;
        v_encrypted := pgp_sym_encrypt('${escaped}', v_secret);
        insert into public.platform_ai_provider_keys (provider_id, key_label, encrypted_key, key_hint, is_active)
        values (v_provider_id, 'repair-primary', v_encrypted, right('${escaped}', 4), true);
      end $$;
    `);
    console.log("Ensured active platform OpenAI key.");
  }

  const { rows } = await client.query(`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='ai_provider_connections' and column_name='uses_platform_key'
      ) as has_uses_platform_key,
      (select count(*)::int from public.platform_ai_providers) as providers,
      (select count(*)::int from public.platform_ai_provider_keys where is_active = true) as active_keys
  `);
  console.log(rows[0]);
  await client.end();
}

main().catch(console.error);
