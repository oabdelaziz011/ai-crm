/**
 * LOCAL development snapshot — export / import / verify / doctor
 *
 * SAFETY:
 * - Source and target MUST be 127.0.0.1:54322 (or localhost:54322).
 * - Export is READ-ONLY (BEGIN READ ONLY). Never mutates the source DB.
 * - Import refuses production hosts / *.supabase.co / webhook.valueor.org.
 * - Import verifies VALUEOR_ENV=local and SUPABASE_URL on :54321.
 * - Import never runs unless explicitly invoked with --confirm-local-import.
 * - Auth bcrypt hashes are restored via dedicated auth.users upsert.
 * - Missing email identities are synthesized at import time (GoTrue login).
 * - Does NOT call supabase link / db push / migration repair.
 * - Does NOT load production env profiles as the DB target.
 *
 * Usage:
 *   node scripts/local-dev-snapshot.mjs export
 *   node scripts/local-dev-snapshot.mjs verify-snapshot
 *   node scripts/local-dev-snapshot.mjs doctor
 *   node scripts/local-dev-snapshot.mjs import --confirm-local-import
 *   node scripts/local-dev-snapshot.mjs help
 *
 * Or:
 *   pnpm snapshot:local-data
 *   pnpm setup:local-data -- --confirm-local-import
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import {
  assertLocalEnvironmentSafety,
  isLocalDatabaseUrl,
  isLocalSupabaseUrl,
  isProductionDatabaseUrl,
  isProductionSupabaseUrl,
  isProductionWebhookUrl,
  resolveValueorEnv,
  VALUEOR_ENV_LOCAL,
} from "./lib/env-mode.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function resolveSnapshotDir(argv = process.argv.slice(2)) {
  const outArg = argv.find((a) => a.startsWith("--out="));
  const name = outArg ? outArg.slice("--out=".length).trim() : process.env.LOCAL_SNAPSHOT_OUT || "dev-snapshot";
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid snapshot out dir name: ${name}`);
  }
  if (!/^dev-snapshot(-v\d+)?$/.test(name) && name !== "dev-snapshot") {
    // Allow only clearly named local snapshot dirs under repo root.
    if (!/^dev-snapshot[\w.-]*$/.test(name)) {
      throw new Error(`REFUSED snapshot out dir "${name}" (expected dev-snapshot or dev-snapshot-vN)`);
    }
  }
  return resolve(ROOT, name);
}

let SNAPSHOT_DIR = resolveSnapshotDir();
let DATA_DIR = resolve(SNAPSHOT_DIR, "data");
let MANIFEST_PATH = resolve(SNAPSHOT_DIR, "manifest.json");

function bindSnapshotPaths(dir) {
  SNAPSHOT_DIR = dir;
  DATA_DIR = resolve(SNAPSHOT_DIR, "data");
  MANIFEST_PATH = resolve(SNAPSHOT_DIR, "manifest.json");
}

/** Hard-coded local default — never fall back to root `.env` production URL. */
const LOCAL_DATABASE_URL =
  process.env.LOCAL_SNAPSHOT_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SKIP_TABLES = new Set([
  // Ephemeral auth state — not needed to recreate the tenant
  "auth.sessions",
  "auth.refresh_tokens",
  "auth.mfa_amr_claims",
  "auth.audit_log_entries",
  "auth.flow_state",
  "auth.one_time_tokens",
  // Managed by Supabase runtime / migrations
  "auth.schema_migrations",
  "storage.migrations",
  // Binary blobs (buckets metadata is enough; objects empty in current local)
  "storage.objects",
  "storage.s3_multipart_uploads",
  "storage.s3_multipart_uploads_parts",
]);

/** Columns that must be nulled in snapshot (except auth.users.encrypted_password). */
const SECRET_COLUMN_PATTERNS = [
  /^encrypted_password$/i, // cleared everywhere except allowlist
  /password(?!_hint$)/i,
  /_secret$/i,
  /^secret$/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /smtp_pass/i,
  /imap_pass/i,
  /auth_token/i,
  /refresh_token/i,
  /bearer/i,
  /credential/i,
  /webhook_secret/i,
  /app_secret/i,
  /encryption_key/i,
  /access_token$/i,
  /provider_token$/i,
  /oauth_token/i,
  /oauth_refresh/i,
  /confirmation_token$/i,
  /recovery_token$/i,
  /reauthentication_token$/i,
  /email_change_token/i,
  /phone_change_token$/i,
  /invite_token$/i,
  /provider_access_token$/i,
  /provider_refresh_token$/i,
  /token_hash$/i,
  /secret_hash$/i,
  /client_secret_hash$/i,
  /refresh_token_hmac/i,
];

/** False-positive column names that look secret-ish but are not. */
const SECRET_COLUMN_ALLOW = new Set([
  "max_tokens",
  "completion_tokens",
  "prompt_tokens",
  "total_tokens",
  "input_tokens",
  "output_tokens",
  "token_count",
  "token_usage",
  "ai_tokens_monthly",
  "budget_tokens",
  "budget_used_tokens",
  "max_context_tokens",
  "path_tokens",
  "token_endpoint_auth_method",
  "token_url",
  "token_status",
  "token_checked_at",
  "token_expires_at",
  "last_credential_alert_at",
  "credential_id",
  "imap_encryption",
  "smtp_encryption",
  "password_hint",
  "smtp_password_hint",
  "imap_password_hint",
  "oauth_token_hint",
  "access_token_hint",
  "app_secret_hint",
  "auth_token_hint",
  "webhook_verify_token_hint",
  "refresh_token_counter",
]);

const SECRET_JSON_KEYS = new Set(
  [
    "password",
    "secret",
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "apiKey",
    "api_key",
    "clientSecret",
    "client_secret",
    "smtpPassword",
    "smtp_password",
    "imapPassword",
    "imap_password",
    "authToken",
    "auth_token",
    "privateKey",
    "private_key",
    "webhookSecret",
    "webhook_secret",
    "appSecret",
    "app_secret",
    "twilioAuthToken",
    "metaAccessToken",
    "whatsappToken",
    "serviceRoleKey",
    "service_role_key",
  ].map((k) => k.toLowerCase()),
);

/** Keep bcrypt hash for LOCAL login recreation only. Never log it. */
const KEEP_SECRET_COLUMNS = new Set(["auth.users.encrypted_password"]);

const KNOWN_DEV_ACCOUNTS = [
  {
    key: "original_development",
    email: "oabdelaziz011@gmail.com",
    expectedCompanyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  },
  {
    key: "secondary_development",
    email: "nhossam@ntgclarity.com",
    expectedCompanyId: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8",
  },
];

function parseDbUrl(url) {
  return new URL(url.replace(/^postgresql:/i, "http:"));
}

function assertLocalDatabaseUrl(url, label) {
  if (!url || typeof url !== "string") {
    throw new Error(`${label}: missing DATABASE_URL`);
  }
  if (/supabase\.co|webhook\.valueor\.org|neon\.tech|amazonaws\.com/i.test(url)) {
    throw new Error(`${label}: REFUSED production-looking URL`);
  }
  if (isProductionDatabaseUrl(url)) {
    throw new Error(`${label}: REFUSED production DATABASE_URL host`);
  }
  const u = parseDbUrl(url);
  const hostOk = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  const portOk = !u.port || u.port === "54322";
  if (!hostOk || !portOk) {
    throw new Error(
      `${label}: REFUSED non-local target ${u.hostname}:${u.port || "(default)"} (required 127.0.0.1:54322)`,
    );
  }
  if (!isLocalDatabaseUrl(url) && !(hostOk && portOk)) {
    throw new Error(`${label}: REFUSED DATABASE_URL that is not local :54322`);
  }
  return { hostname: u.hostname, port: u.port || "54322" };
}

/**
 * Import-only gate: VALUEOR_ENV=local, Supabase :54321, Postgres :54322.
 * Loads `.env.localstack` via local profile — never uses production as DB target.
 */
function assertImportEnvironmentSafety() {
  const env = loadProjectEnv(ROOT, {
    valueorEnv: VALUEOR_ENV_LOCAL,
    hydrateProcessEnv: false,
    assertSafety: true,
  });
  assertLocalEnvironmentSafety(env);

  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_LOCAL) {
    throw new Error(`import: REFUSED VALUEOR_ENV=${mode} (required local)`);
  }

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  if (!supabaseUrl || !isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      "import: REFUSED — SUPABASE_URL/VITE_SUPABASE_URL must be http://127.0.0.1:54321 (or localhost)",
    );
  }
  if (isProductionSupabaseUrl(supabaseUrl)) {
    throw new Error("import: REFUSED production Supabase URL");
  }

  for (const key of ["WEBHOOK_BASE_URL", "VITE_WEBHOOK_BASE_URL", "PUBLIC_WEBHOOK_BASE_URL"]) {
    if (env[key] && isProductionWebhookUrl(env[key])) {
      throw new Error(`import: REFUSED ${key} points at production webhook`);
    }
  }

  // DB target is always the hard-coded local URL (not root .env).
  assertLocalDatabaseUrl(LOCAL_DATABASE_URL, "import");

  console.log("[safety:import-env]", {
    VALUEOR_ENV: mode,
    SUPABASE_URL: "http://127.0.0.1:54321",
    DATABASE_URL: "postgresql://…@127.0.0.1:54322/postgres",
  });

  return env;
}

function isSecretColumn(schema, table, column) {
  const full = `${schema}.${table}.${column}`;
  if (KEEP_SECRET_COLUMNS.has(full)) return false;
  if (SECRET_COLUMN_ALLOW.has(column)) return false;
  return SECRET_COLUMN_PATTERNS.some((re) => re.test(column));
}

function sanitizeJsonValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeStringContent(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (typeof value === "object") {
    if (Buffer.isBuffer(value)) return null;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_JSON_KEYS.has(k.toLowerCase()) || isSecretColumn("json", "json", k)) {
        out[k] = null;
        continue;
      }
      out[k] = sanitizeJsonValue(v);
    }
    return out;
  }
  return value;
}

/** Redact production hosts / obvious secret-like tokens from free-text fields. */
function sanitizeStringContent(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  // Production Supabase project URLs (logos, storage links embedded in HTML email, etc.)
  out = out.replace(
    /https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"'<>]*/gi,
    "http://127.0.0.1:54321/storage/v1/object/public/__redacted__",
  );
  // Production webhook endpoints
  out = out.replace(
    /https?:\/\/webhook\.valueor\.org[^\s"'<>]*/gi,
    "http://127.0.0.1:3000/api/webhooks/__redacted__",
  );
  // Obvious OpenAI-style API keys (avoid matching quoted-printable "...NmIsk-2B8z...")
  out = out.replace(/(?<![A-Za-z0-9])sk-[a-zA-Z0-9]{20,}/g, "sk-__REDACTED__");
  out = out.replace(/whsec_[a-zA-Z0-9]+/g, "whsec___REDACTED__");
  out = out.replace(/AKIA[0-9A-Z]{16}/g, "AKIA__REDACTED__");
  return out;
}

function encodeCell(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) {
    return { __type: "bytea", base64: value.toString("base64") };
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return value;
  return value;
}

function decodeCell(value) {
  if (value && typeof value === "object" && value.__type === "bytea") {
    return Buffer.from(value.base64, "base64");
  }
  return value;
}

function sanitizeRow(schema, table, row) {
  const out = {};
  const cleared = [];
  for (const [col, raw] of Object.entries(row)) {
    let value = encodeCell(raw);
    if (isSecretColumn(schema, table, col)) {
      out[col] = null;
      cleared.push(col);
      continue;
    }
    if (typeof value === "string") {
      value = sanitizeStringContent(value);
    } else if (value && typeof value === "object" && !Buffer.isBuffer(raw) && value.__type !== "bytea") {
      value = sanitizeJsonValue(value);
    }
    out[col] = value;
  }
  return { row: out, cleared };
}

function tableFileName(schema, table) {
  return `${schema}.${table}.json`;
}

async function connectLocalReadOnly() {
  assertLocalDatabaseUrl(LOCAL_DATABASE_URL, "export");
  const client = new pg.Client({
    connectionString: LOCAL_DATABASE_URL,
    statement_timeout: 180_000,
  });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const info = await client.query(`
    SELECT current_database() AS db,
           inet_server_addr()::text AS addr,
           inet_server_port() AS container_port,
           current_setting('server_version') AS ver
  `);
  console.log("[safety:export]", {
    urlHost: "127.0.0.1",
    urlPort: 54322,
    db: info.rows[0].db,
    containerAddr: info.rows[0].addr,
    containerPort: info.rows[0].container_port,
    version: info.rows[0].ver,
    mode: "READ ONLY",
  });
  return client;
}

async function connectLocalWrite() {
  assertImportEnvironmentSafety();
  assertLocalDatabaseUrl(LOCAL_DATABASE_URL, "import");
  const client = new pg.Client({
    connectionString: LOCAL_DATABASE_URL,
    statement_timeout: 300_000,
  });
  await client.connect();
  const info = await client.query(`
    SELECT current_database() AS db,
           inet_server_addr()::text AS addr,
           inet_server_port() AS container_port
  `);
  console.log("[safety:import]", {
    urlHost: "127.0.0.1",
    urlPort: 54322,
    db: info.rows[0].db,
    containerAddr: info.rows[0].addr,
    containerPort: info.rows[0].container_port,
  });
  return client;
}

async function listCandidateTables(client) {
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public', 'auth', 'storage')
    ORDER BY n.nspname, c.relname
  `);
  return rows
    .map((r) => ({ schema: r.schema, table: r.table_name, key: `${r.schema}.${r.table_name}` }))
    .filter((t) => !SKIP_TABLES.has(t.key));
}

async function exportSnapshot() {
  mkdirSync(DATA_DIR, { recursive: true });
  // Clear previous data files only (not README)
  for (const name of existsSync(DATA_DIR) ? readdirSync(DATA_DIR) : []) {
    rmSync(join(DATA_DIR, name), { force: true });
  }

  const client = await connectLocalReadOnly();
  const clearedColumns = new Map();
  const tablesExported = [];
  let totalRows = 0;

  try {
    const candidates = await listCandidateTables(client);
    for (const t of candidates) {
      const countRes = await client.query(
        `SELECT count(*)::int AS n FROM "${t.schema}"."${t.table}"`,
      );
      const n = countRes.rows[0].n;
      if (n === 0) continue;

      const { rows } = await client.query(`SELECT * FROM "${t.schema}"."${t.table}"`);
      const sanitized = [];
      const clearedSet = new Set();
      for (const row of rows) {
        const { row: clean, cleared } = sanitizeRow(t.schema, t.table, row);
        sanitized.push(clean);
        for (const c of cleared) clearedSet.add(c);
      }
      if (clearedSet.size) {
        clearedColumns.set(t.key, [...clearedSet].sort());
      }

      const file = tableFileName(t.schema, t.table);
      writeFileSync(
        resolve(DATA_DIR, file),
        JSON.stringify(
          {
            schema: t.schema,
            table: t.table,
            rowCount: sanitized.length,
            rows: sanitized,
          },
          null,
          2,
        ),
        "utf8",
      );
      tablesExported.push({
        schema: t.schema,
        table: t.table,
        rows: sanitized.length,
        file,
        secretsCleared: [...clearedSet],
      });
      totalRows += sanitized.length;
      console.log(`[export] ${t.key}: ${sanitized.length} rows`);
    }

    // Auth user summary WITHOUT hashes
    let authSummary = [];
    try {
      const { rows } = await client.query(`
        SELECT id, email,
               encrypted_password IS NOT NULL AND length(encrypted_password) > 0 AS has_password_hash,
               email_confirmed_at IS NOT NULL AS email_confirmed,
               banned_until, deleted_at, is_super_admin, is_anonymous
        FROM auth.users
        ORDER BY email
      `);
      authSummary = rows;
    } catch (e) {
      console.warn("[export] auth summary skipped:", e.message);
    }

    const manifest = {
      format: "valueor-local-dev-snapshot-v1",
      generatedAt: new Date().toISOString(),
      source: {
        databaseUrlHost: "127.0.0.1",
        databaseUrlPort: 54322,
        supabaseUrl: "http://127.0.0.1:54321",
        valueorEnv: "local",
        note: "Exported READ-ONLY from local Supabase Docker Postgres.",
      },
      totals: {
        tables: tablesExported.length,
        rows: totalRows,
      },
      tables: tablesExported,
      secretsClearedByTable: Object.fromEntries(clearedColumns),
      authUsers: authSummary,
      skipTables: [...SKIP_TABLES],
      importNotes: [
        "Run migrations/schema first on a fresh local Supabase (`supabase start` + migrate).",
        "Then: pnpm setup:local-data -- --confirm-local-import",
        "Import refuses non-local DATABASE_URL and production SUPABASE_URL.",
        "Password hashes are included for LOCAL login only — never print or commit to public remotes.",
        "Integration secrets are nulled; reconfigure SMTP/IMAP/WhatsApp/etc. locally as needed.",
      ],
    };

    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    writeFileSync(
      resolve(SNAPSHOT_DIR, "AUTH_USERS.md"),
      [
        "# Auth users in this LOCAL snapshot",
        "",
        "Password hashes are stored in `data/auth.users.json` for local login recreation.",
        "They are bcrypt hashes — not plaintext. Do not print them. Do not publish publicly.",
        "",
        "| Email | Has hash | Confirmed |",
        "| --- | --- | --- |",
        ...authSummary.map(
          (u) =>
            `| ${u.email} | ${u.has_password_hash ? "yes" : "no"} | ${u.email_confirmed ? "yes" : "no"} |`,
        ),
        "",
      ].join("\n"),
      "utf8",
    );

    console.log(`[export] DONE tables=${tablesExported.length} rows=${totalRows}`);
    console.log(`[export] manifest=${MANIFEST_PATH}`);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    await client.end();
  }
}

function preferredImportOrder(files) {
  const priority = (name) => {
    if (name === "auth.users.json") return 10;
    if (name === "auth.identities.json") return 20;
    if (name.startsWith("auth.")) return 30;
    if (name === "public.companies.json") return 40;
    if (name === "public.profiles.json") return 50;
    if (name === "public.permissions.json") return 60;
    if (name === "public.roles.json") return 70;
    if (name === "public.role_permissions.json") return 80;
    if (name === "public.user_roles.json") return 90;
    if (name.startsWith("public.")) return 100;
    if (name.startsWith("storage.")) return 200;
    return 150;
  };
  return [...files].sort((a, b) => {
    const d = priority(a) - priority(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

async function importTable(client, payload) {
  const { schema, table, rows } = payload;
  if (!rows?.length) return 0;
  let inserted = 0;
  for (const raw of rows) {
    const row = {};
    for (const [k, v] of Object.entries(raw)) {
      row[k] = decodeCell(v);
    }
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colSql = cols.map((c) => `"${c}"`).join(", ");
    const values = cols.map((c) => {
      const v = row[c];
      if (v && typeof v === "object" && !Buffer.isBuffer(v) && !(v instanceof Date)) {
        return JSON.stringify(v);
      }
      return v;
    });
    try {
      await client.query("SAVEPOINT sp_row");
      await client.query(
        `INSERT INTO "${schema}"."${table}" (${colSql}) VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values,
      );
      await client.query("RELEASE SAVEPOINT sp_row");
      inserted++;
    } catch (e) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT sp_row");
      } catch {
        /* ignore */
      }
      console.warn(`[import] ${schema}.${table} row skipped: ${e.message}`);
    }
  }
  return inserted;
}

/**
 * Dedicated auth.users upsert — preserves encrypted_password bcrypt hashes.
 * Never logs hash values.
 */
async function importAuthUsers(client, users) {
  let n = 0;
  let withHash = 0;
  for (const u of users) {
    const hasHash =
      typeof u.encrypted_password === "string" && u.encrypted_password.length > 0;
    if (hasHash) withHash++;
    try {
      await client.query("SAVEPOINT sp_auth_user");
      await client.query(
        `INSERT INTO auth.users (
           id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
           recovery_token, recovery_sent_at, email_change_token_new, email_change,
           email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
           is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
           phone_change, phone_change_token, phone_change_sent_at,
           email_change_token_current, email_change_confirm_status,
           banned_until, reauthentication_token, reauthentication_sent_at,
           is_sso_user, deleted_at, is_anonymous
         ) VALUES (
           $1, coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'),
           coalesce($3, 'authenticated'), coalesce($4, 'authenticated'),
           $5, $6,
           $7, $8, coalesce($9, ''), $10,
           coalesce($11, ''), $12, coalesce($13, ''), coalesce($14, ''),
           $15, $16, $17::jsonb, $18::jsonb,
           $19, coalesce($20, now()), coalesce($21, now()), $22, $23,
           coalesce($24, ''), coalesce($25, ''), $26,
           coalesce($27, ''), coalesce($28, 0),
           $29, coalesce($30, ''), $31,
           coalesce($32, false), $33, coalesce($34, false)
         )
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           encrypted_password = EXCLUDED.encrypted_password,
           email_confirmed_at = EXCLUDED.email_confirmed_at,
           raw_app_meta_data = EXCLUDED.raw_app_meta_data,
           raw_user_meta_data = EXCLUDED.raw_user_meta_data,
           updated_at = now(),
           deleted_at = EXCLUDED.deleted_at,
           banned_until = EXCLUDED.banned_until`,
        [
          u.id,
          u.instance_id,
          u.aud,
          u.role,
          u.email,
          u.encrypted_password,
          u.email_confirmed_at,
          u.invited_at,
          u.confirmation_token ?? "",
          u.confirmation_sent_at,
          u.recovery_token ?? "",
          u.recovery_sent_at,
          u.email_change_token_new ?? "",
          u.email_change ?? "",
          u.email_change_sent_at,
          u.last_sign_in_at,
          JSON.stringify(u.raw_app_meta_data ?? {}),
          JSON.stringify(u.raw_user_meta_data ?? {}),
          u.is_super_admin,
          u.created_at,
          u.updated_at,
          u.phone,
          u.phone_confirmed_at,
          u.phone_change ?? "",
          u.phone_change_token ?? "",
          u.phone_change_sent_at,
          u.email_change_token_current ?? "",
          u.email_change_confirm_status ?? 0,
          u.banned_until,
          u.reauthentication_token ?? "",
          u.reauthentication_sent_at,
          u.is_sso_user ?? false,
          u.deleted_at,
          u.is_anonymous ?? false,
        ],
      );
      await client.query("RELEASE SAVEPOINT sp_auth_user");
      n++;
    } catch (e) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT sp_auth_user");
      } catch {
        /* ignore */
      }
      console.warn(`[import] auth.users ${u.email}: ${e.message}`);
    }
  }
  console.log(`[import] auth.users: ${n}/${users.length} (with_password_hash=${withHash})`);
  return n;
}

/**
 * GoTrue email/password login requires auth.identities provider=email.
 * Snapshot may lack identities for some users — synthesize at import time only.
 */
async function ensureEmailIdentities(client, users, existingIdentities) {
  const hasEmailIdentity = new Set(
    (existingIdentities || [])
      .filter((i) => (i.provider || "email") === "email")
      .map((i) => i.user_id),
  );
  let created = 0;
  for (const u of users) {
    if (!u?.id || !u?.email) continue;
    if (hasEmailIdentity.has(u.id)) continue;
    const identityData = {
      sub: u.id,
      email: u.email,
      email_verified: Boolean(u.email_confirmed_at),
    };
    try {
      await client.query("SAVEPOINT sp_ident_synth");
      await client.query(
        `INSERT INTO auth.identities (
           id, user_id, identity_data, provider, provider_id,
           last_sign_in_at, created_at, updated_at, email
         ) VALUES (
           $1::uuid, $2::uuid, $3::jsonb, 'email', $2::text,
           $4, coalesce($5, now()), coalesce($6, now()), $7
         )
         ON CONFLICT DO NOTHING`,
        [
          u.id,
          u.id,
          JSON.stringify(identityData),
          u.last_sign_in_at,
          u.created_at,
          u.updated_at,
          u.email,
        ],
      );
      await client.query("RELEASE SAVEPOINT sp_ident_synth");
      created++;
    } catch (e) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT sp_ident_synth");
      } catch {
        /* ignore */
      }
      // Alternate unique constraint shapes across GoTrue versions
      try {
        await client.query("SAVEPOINT sp_ident_synth2");
        await client.query(
          `INSERT INTO auth.identities (
             id, user_id, identity_data, provider, provider_id,
             last_sign_in_at, created_at, updated_at, email
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::jsonb, 'email', $1::text,
             $3, coalesce($4, now()), coalesce($5, now()), $6
           )
           ON CONFLICT DO NOTHING`,
          [
            u.id,
            JSON.stringify(identityData),
            u.last_sign_in_at,
            u.created_at,
            u.updated_at,
            u.email,
          ],
        );
        await client.query("RELEASE SAVEPOINT sp_ident_synth2");
        created++;
      } catch (e2) {
        try {
          await client.query("ROLLBACK TO SAVEPOINT sp_ident_synth2");
        } catch {
          /* ignore */
        }
        console.warn(`[import] identity synthesize ${u.email}: ${e2.message}`);
      }
    }
  }
  console.log(`[import] auth.identities synthesized: ${created}`);
  return created;
}

async function importSnapshot(argv) {
  if (!argv.includes("--confirm-local-import")) {
    throw new Error(
      "REFUSED: import requires explicit --confirm-local-import. " +
        "This protects the current local DB from accidental overwrite.",
    );
  }
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}. Run export first.`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.format !== "valueor-local-dev-snapshot-v1") {
    throw new Error(`Unsupported snapshot format: ${manifest.format}`);
  }

  const client = await connectLocalWrite();
  const result = { imported: {}, errors: [], auth: {} };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("SET LOCAL row_security = off");

    const authUsersPath = resolve(DATA_DIR, "auth.users.json");
    const authIdentPath = resolve(DATA_DIR, "auth.identities.json");
    const authUsersPayload = existsSync(authUsersPath)
      ? JSON.parse(readFileSync(authUsersPath, "utf8"))
      : { rows: [] };
    const authIdentPayload = existsSync(authIdentPath)
      ? JSON.parse(readFileSync(authIdentPath, "utf8"))
      : { rows: [] };

    // 1) Auth users with password hashes (dedicated path)
    result.imported["auth.users"] = await importAuthUsers(client, authUsersPayload.rows || []);
    result.auth.usersWithHash = (authUsersPayload.rows || []).filter(
      (u) => typeof u.encrypted_password === "string" && u.encrypted_password.length > 0,
    ).length;

    // 2) Existing identities from snapshot
    if ((authIdentPayload.rows || []).length) {
      result.imported["auth.identities"] = await importTable(client, {
        schema: "auth",
        table: "identities",
        rows: authIdentPayload.rows,
        rowCount: authIdentPayload.rows.length,
      });
    }

    // 3) Synthesize missing email identities so GoTrue can authenticate
    result.imported["auth.identities_synthesized"] = await ensureEmailIdentities(
      client,
      authUsersPayload.rows || [],
      authIdentPayload.rows || [],
    );

    // 4) Remaining tables (skip auth.users / auth.identities already handled)
    const files = readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => f !== "auth.users.json" && f !== "auth.identities.json");

    for (const file of preferredImportOrder(files)) {
      const payload = JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8"));
      const key = `${payload.schema}.${payload.table}`;
      try {
        const n = await importTable(client, payload);
        result.imported[key] = n;
        console.log(`[import] ${key}: ${n}/${payload.rowCount ?? "?"} rows`);
      } catch (e) {
        result.errors.push({ table: key, error: e.message });
        console.warn(`[import] ${key} FAILED: ${e.message}`);
      }
    }

    await client.query("COMMIT");
    writeFileSync(
      resolve(SNAPSHOT_DIR, "last-import-report.json"),
      JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2),
      "utf8",
    );
    console.log("[import] DONE");
    console.log(
      "[import] NOTE: external integrations remain sanitized/disabled; no outbound messages are sent by this import.",
    );
    if (result.errors.length) {
      console.warn("[import] completed with row/table errors:", result.errors.length);
      process.exitCode = 2;
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
}

function loadSnapTable(schema, table) {
  const p = resolve(DATA_DIR, `${schema}.${table}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function doctorSnapshot() {
  if (!existsSync(MANIFEST_PATH)) throw new Error("manifest.json missing");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const users = loadSnapTable("auth", "users")?.rows || [];
  const identities = loadSnapTable("auth", "identities")?.rows || [];
  const profiles = loadSnapTable("public", "profiles")?.rows || [];
  const companies = loadSnapTable("public", "companies")?.rows || [];
  const roles = loadSnapTable("public", "roles")?.rows || [];
  const userRoles = loadSnapTable("public", "user_roles")?.rows || [];

  const profileIds = new Set(profiles.map((p) => p.id));
  const companyIds = new Set(companies.map((c) => c.id));
  const identityUsers = new Set(
    identities.filter((i) => (i.provider || "email") === "email").map((i) => i.user_id),
  );

  const classified = users.map((u) => {
    const email = String(u.email || "").toLowerCase();
    let cls = "unclassified";
    if (email.endsWith("@vaultos.local") || email.startsWith("demo-")) cls = "enterprise_demo_user";
    else if (email === "oabdelaziz011@gmail.com") cls = "required_development_user";
    else if (email === "nhossam@ntgclarity.com") cls = "required_secondary_development_user";
    else cls = "orphan_or_ad_hoc_local_user";

    const ur = userRoles.filter((r) => r.user_id === u.id);
    const roleRows = ur.map((r) => roles.find((role) => role.id === r.role_id)).filter(Boolean);
    return {
      email: u.email,
      class: cls,
      hasEncryptedPassword:
        typeof u.encrypted_password === "string" && u.encrypted_password.length > 0,
      hashLooksBcrypt:
        typeof u.encrypted_password === "string" &&
        /^\$2[aby]\$/.test(u.encrypted_password),
      hasProfile: profileIds.has(u.id),
      hasEmailIdentity: identityUsers.has(u.id),
      roleNames: roleRows.map((r) => r.name),
      roleCompanyIds: roleRows.map((r) => r.company_id),
      roleCompanyPresentInSnapshot: roleRows.map((r) =>
        r.company_id ? companyIds.has(r.company_id) : null,
      ),
    };
  });

  const accounts = {};
  for (const spec of KNOWN_DEV_ACCOUNTS) {
    const row = classified.find((c) => c.email?.toLowerCase() === spec.email);
    accounts[spec.key] = row
      ? {
          present: true,
          email: row.email,
          hasEncryptedPassword: row.hasEncryptedPassword,
          hashLooksBcrypt: row.hashLooksBcrypt,
          hasProfile: row.hasProfile,
          hasEmailIdentity: row.hasEmailIdentity,
          roleNames: row.roleNames,
          expectedCompanyInSnapshot: companyIds.has(spec.expectedCompanyId),
          note: !row.hasProfile
            ? "Auth+role present; profile/company tenant rows missing in this snapshot"
            : "ok",
        }
      : { present: false, email: spec.email };
  }

  const missingProfiles = classified.filter((c) => !c.hasProfile);
  const warnings = [];
  if (missingProfiles.length) {
    warnings.push(
      `${missingProfiles.length} auth user(s) have no public.profiles row in this snapshot.`,
    );
  }
  for (const spec of KNOWN_DEV_ACCOUNTS) {
    const row = accounts[spec.key];
    if (!row?.present) {
      warnings.push(`Required development account missing from snapshot: ${spec.email}`);
    } else if (!row.hasProfile) {
      warnings.push(
        `${spec.email}: auth+role present but profile/company tenant rows missing in this snapshot.`,
      );
    } else if (!row.expectedCompanyInSnapshot) {
      warnings.push(
        `${spec.email}: expected company UUID ${spec.expectedCompanyId} not present in snapshot companies.`,
      );
    }
  }
  warnings.push(
    "Import preserves bcrypt hashes and synthesizes email identities; it does NOT invent missing profiles/companies.",
  );

  const report = {
    snapshotFormat: manifest.format,
    tables: manifest.totals?.tables,
    rows: manifest.totals?.rows,
    authUsers: users.length,
    profiles: profiles.length,
    companies: companies.length,
    authWithoutProfile: missingProfiles.map((c) => ({
      email: c.email,
      class: c.class,
    })),
    developmentAccounts: accounts,
    importWillSynthesizeMissingEmailIdentities: classified.filter((c) => !c.hasEmailIdentity)
      .length,
    warnings,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function verifySnapshotFiles() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error("manifest.json missing");
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  let bytes = 0;
  for (const f of [MANIFEST_PATH, ...files.map((x) => resolve(DATA_DIR, x))]) {
    bytes += statSync(f).size;
  }

  const banned = [
    /[a-z0-9-]+\.supabase\.co/i,
    /webhook\.valueor\.org/i,
    /(?<![A-Za-z0-9])sk-[a-zA-Z0-9]{20,}/,
    /whsec_[a-zA-Z0-9]+/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  ];
  const hits = [];
  // Scan data + manifest only. Docs may mention blocked hostnames as examples.
  const scanTargets = [
    MANIFEST_PATH,
    ...files
      .filter((f) => f !== "auth.users.json")
      .map((f) => resolve(DATA_DIR, f)),
  ];
  for (const path of scanTargets) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const re of banned) {
      if (re.test(text)) {
        hits.push({ path, pattern: String(re) });
      }
    }
  }

  // auth.users may contain bcrypt hashes ($2a$) — allowed; ensure no plaintext password field dumps
  const authPath = resolve(DATA_DIR, "auth.users.json");
  if (existsSync(authPath)) {
    const authText = readFileSync(authPath, "utf8");
    if (/supabase\.co|webhook\.valueor\.org/i.test(authText)) {
      hits.push({ path: authPath, pattern: "production_url_in_auth" });
    }
  }

  const report = {
    ok: hits.length === 0,
    tables: manifest.totals?.tables ?? files.length,
    rows: manifest.totals?.rows ?? null,
    files: files.length,
    sizeBytes: bytes,
    sizeHuman: `${(bytes / (1024 * 1024)).toFixed(2)} MiB`,
    productionLeakHits: hits,
    authUserCount: manifest.authUsers?.length ?? 0,
    importGuardPresent: true,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    throw new Error("Snapshot verification FAILED — production/secret patterns found");
  }
  return report;
}

function printHelp() {
  console.log(`ValueOR LOCAL development snapshot

Commands:
  export                 READ-ONLY dump from 127.0.0.1:54322 → dev-snapshot/
  verify-snapshot        Scan snapshot files for production URLs / obvious secrets
  doctor                 Report auth/profile/company readiness (no DB writes)
  import --confirm-local-import
                         Import into LOCAL 127.0.0.1:54322 only (explicit confirm required)
  help                   Show this help

Safety:
  - Never connects to *.supabase.co as the import target
  - Requires VALUEOR_ENV=local and SUPABASE_URL on :54321
  - Export uses BEGIN READ ONLY
  - Import refuses production DATABASE_URL / webhook.valueor.org
  - Auth bcrypt hashes restored via dedicated upsert; missing email identities synthesized
  - Does not run automatically; does not reset your DB unless you confirm import
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "help";
  // Re-bind after argv parse so --out= / LOCAL_SNAPSHOT_OUT apply consistently.
  bindSnapshotPaths(resolveSnapshotDir(argv));
  switch (cmd) {
    case "export":
      await exportSnapshot();
      verifySnapshotFiles();
      break;
    case "verify-snapshot":
      verifySnapshotFiles();
      break;
    case "doctor":
      doctorSnapshot();
      break;
    case "import":
      await importSnapshot(argv);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      printHelp();
      throw new Error(`Unknown command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error("[local-dev-snapshot]", err.message || err);
  process.exit(1);
});
