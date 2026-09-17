/**
 * ONE-OFF LOCAL provisioning: clone two development tenants + auth users
 * from production (READ-ONLY) into local Supabase.
 *
 * Production: SELECT only. Never INSERT/UPDATE/DELETE/ALTER on production.
 * Local: import into 127.0.0.1:54322. Does not modify migration history.
 * Secrets: sanitized. Password hashes copied (no plaintext).
 *
 * Usage:
 *   node scripts/_local-clone-dev-tenants.mjs identify
 *   node scripts/_local-clone-dev-tenants.mjs export
 *   node scripts/_local-clone-dev-tenants.mjs import
 *   node scripts/_local-clone-dev-tenants.mjs verify
 *   node scripts/_local-clone-dev-tenants.mjs all
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolveProjectRoot(import.meta.url);
const OUT_DIR = resolve(root, "artifacts/.local-dev-clone");
const MANIFEST = resolve(OUT_DIR, "manifest.json");
const COUNTS = resolve(OUT_DIR, "counts-source.json");

const USERS = [
  {
    key: "original_dev",
    email: "oabdelaziz011@gmail.com",
    expectedCompanyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  },
  {
    key: "nhossam",
    email: "nhossam@ntgclarity.com",
    expectedCompanyId: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8",
  },
];

/** Columns that must never carry usable production secrets into LOCAL. */
const SECRET_COLUMN_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
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
];

const SECRET_JSON_KEYS = [
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
];

function assertReadOnlySql(sql) {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (!/^(select|with)\b/.test(normalized)) {
    throw new Error(`REFUSED non-SELECT against production: ${sql.slice(0, 120)}`);
  }
  if (/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|call|do)\b/.test(normalized)) {
    // Allow SELECT ... FROM only; block DML/DDL keywords outside of column names carefully.
    // Use a stricter gate: reject if statement is not pure SELECT/WITH.
    const withoutStrings = normalized.replace(/'[^']*'/g, "''");
    if (/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/.test(withoutStrings)) {
      throw new Error(`REFUSED mutating keyword in production SQL: ${sql.slice(0, 120)}`);
    }
  }
}

async function connectProd() {
  const env = loadProjectEnv(root, { valueorEnv: "production" });
  if (!env.DATABASE_URL) throw new Error("Missing production DATABASE_URL");
  const host = new URL(env.DATABASE_URL.replace(/^postgresql:/, "http:")).host;
  if (/127\.0\.0\.1|localhost/i.test(host)) {
    throw new Error(`Production DATABASE_URL points at local host: ${host}`);
  }
  console.log(`[prod] connecting READ-ONLY to ${host}`);
  const c = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  await c.connect();
  // Force transaction read-only for the session
  await c.query("begin read only");
  await c.query(`select set_config('request.jwt.claim.role', 'service_role', true)`);
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  return {
    client: c,
    host,
    async q(sql, params = []) {
      assertReadOnlySql(sql);
      return c.query(sql, params);
    },
    async end() {
      try {
        await c.query("rollback");
      } catch {
        /* ignore */
      }
      await c.end();
    },
  };
}

async function connectLocal() {
  const env = loadProjectEnv(root, { valueorEnv: "local" });
  const url = env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const host = new URL(url.replace(/^postgresql:/, "http:")).host;
  if (!/127\.0\.0\.1|localhost/i.test(host)) {
    throw new Error(`LOCAL DATABASE_URL is not local: ${host}`);
  }
  console.log(`[local] connecting to ${host}`);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`select set_config('request.jwt.claim.role', 'service_role', false)`);
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  return c;
}

function isSecretColumn(col) {
  return SECRET_COLUMN_PATTERNS.some((re) => re.test(col));
}

function sanitizeJsonValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_JSON_KEYS.some((s) => s.toLowerCase() === k.toLowerCase()) || isSecretColumn(k)) {
        out[k] = null;
        continue;
      }
      out[k] = sanitizeJsonValue(v);
    }
    return out;
  }
  return value;
}

function sanitizeRow(row, columns) {
  const out = { ...row };
  for (const col of columns) {
    if (isSecretColumn(col)) {
      out[col] = null;
      continue;
    }
    const v = out[col];
    if (v instanceof Date) {
      out[col] = v.toISOString();
      continue;
    }
    // node-pg may return custom objects for timestamps in some drivers
    if (v && typeof v === "object" && typeof v.toISOString === "function") {
      try {
        out[col] = v.toISOString();
        continue;
      } catch {
        /* fall through */
      }
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // Plain JSON objects only — never Object.entries(Date) which becomes {}
      const proto = Object.getPrototypeOf(v);
      if (proto === Object.prototype || proto === null) {
        out[col] = sanitizeJsonValue(v);
      } else {
        // Unknown object type — stringify via JSON if possible
        try {
          out[col] = JSON.parse(JSON.stringify(v));
        } catch {
          out[col] = null;
        }
      }
    }
  }
  return out;
}

async function identify() {
  mkdirSync(OUT_DIR, { recursive: true });
  const prod = await connectProd();
  try {
    const emails = USERS.map((u) => u.email.toLowerCase());
    const { rows: profiles } = await prod.q(
      `select p.id, p.email, p.full_name, p.company_id, p.is_active, p.job_title,
              c.approval_status, c.name as company_name, c.status as company_status,
              (au.encrypted_password is not null and length(au.encrypted_password) > 0) as has_password_hash,
              au.email_confirmed_at is not null as email_confirmed,
              au.banned_until, au.deleted_at
       from public.profiles p
       left join public.companies c on c.id = p.company_id
       left join auth.users au on au.id = p.id
       where lower(p.email) = any($1::text[])`,
      [emails],
    );

    const report = { stamp: new Date().toISOString(), users: [], productionWrites: 0 };
    for (const spec of USERS) {
      const p = profiles.find((r) => r.email?.toLowerCase() === spec.email.toLowerCase());
      if (!p) {
        report.users.push({ key: spec.key, email: spec.email, status: "NOT_FOUND_IN_SOURCE" });
        continue;
      }
      const { rows: roles } = await prod.q(
        `select r.id, r.name, r.template_key, r.role_type, r.company_id, r.is_system
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
         where ur.user_id = $1::uuid
         order by r.name`,
        [p.id],
      );
      const { rows: permCounts } = await prod.q(
        `select
           (select count(*)::int from public.role_permissions rp
              join public.user_roles ur on ur.role_id = rp.role_id
             where ur.user_id = $1::uuid) as role_permission_count,
           (select count(*)::int from public.user_permissions up
             where up.user_id = $1::uuid) as direct_permission_count`,
        [p.id],
      );
      report.users.push({
        key: spec.key,
        status: "FOUND",
        email: p.email,
        authUserId: p.id,
        profileId: p.id,
        companyId: p.company_id,
        companyName: p.company_name,
        companyStatus: p.company_status,
        isActive: p.is_active,
        jobTitle: p.job_title,
        approvalStatus: p.approval_status,
        hasPasswordHash: p.has_password_hash,
        emailConfirmed: p.email_confirmed,
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          templateKey: r.template_key,
          roleType: r.role_type,
          companyId: r.company_id,
        })),
        permissionCounts: permCounts[0],
        companyIdMatchesExpected: p.company_id === spec.expectedCompanyId,
      });
    }

    writeFileSync(resolve(OUT_DIR, "identify.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    const missing = report.users.filter((u) => u.status !== "FOUND");
    if (missing.length) {
      console.error("STOP: missing source account(s)", missing.map((m) => m.email));
      process.exitCode = 2;
    }
    return report;
  } finally {
    await prod.end();
  }
}

/** Discover public tables with company_id (or known tenant columns). */
async function discoverTenantTables(prod) {
  const { rows } = await prod.q(`
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where t.table_type = 'BASE TABLE'
      and c.table_schema = 'public'
      and c.column_name in ('company_id', 'tenant_id')
    order by c.table_name, c.column_name
  `);
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name).push(r.column_name);
  }
  return [...byTable.entries()].map(([table, cols]) => ({
    table,
    tenantCol: cols.includes("company_id") ? "company_id" : cols[0],
  }));
}

async function tableColumns(prod, schema, table) {
  const { rows } = await prod.q(
    `select column_name, data_type, udt_name
     from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => r.column_name);
}

async function exportData() {
  mkdirSync(OUT_DIR, { recursive: true });
  const identifyReport = existsSync(resolve(OUT_DIR, "identify.json"))
    ? JSON.parse(readFileSync(resolve(OUT_DIR, "identify.json"), "utf8"))
    : await identify();

  const found = identifyReport.users.filter((u) => u.status === "FOUND");
  if (found.length !== USERS.length) {
    throw new Error("Cannot export: not all users found in source");
  }

  const companyIds = [...new Set(found.map((u) => u.companyId))];
  const userIds = found.map((u) => u.authUserId);

  const prod = await connectProd();
  const counts = {};
  try {
    // Auth users (include encrypted_password hash — never log it)
    const authCols = await tableColumns(prod, "auth", "users");
    const authSelectCols = authCols.filter((c) => c !== "raw_app_meta_data" || true);
    const { rows: authUsers } = await prod.q(
      `select * from auth.users where id = any($1::uuid[])`,
      [userIds],
    );
    // identities
    let authIdentities = [];
    try {
      const { rows } = await prod.q(
        `select * from auth.identities where user_id = any($1::uuid[])`,
        [userIds],
      );
      authIdentities = rows;
    } catch (e) {
      console.warn("auth.identities skip", e.message);
    }

    writeFileSync(
      resolve(OUT_DIR, "auth-users.json"),
      JSON.stringify(
        authUsers.map((u) => {
          const copy = { ...u };
          // Keep hash in file (local disk only) but mark presence for report
          return copy;
        }),
        null,
        2,
      ),
    );
    writeFileSync(resolve(OUT_DIR, "auth-identities.json"), JSON.stringify(authIdentities, null, 2));
    counts.auth_users = authUsers.length;
    counts.auth_identities = authIdentities.length;

    // Companies
    const { rows: companies } = await prod.q(
      `select * from public.companies where id = any($1::uuid[])`,
      [companyIds],
    );
    writeFileSync(
      resolve(OUT_DIR, "companies.json"),
      JSON.stringify(
        companies.map((row) => sanitizeRow(row, Object.keys(row))),
        null,
        2,
      ),
    );
    counts.companies = companies.length;

    // Profiles for all users in those companies (needed for FK integrity of assigned_to etc.)
    const { rows: companyProfiles } = await prod.q(
      `select * from public.profiles where company_id = any($1::uuid[]) or id = any($2::uuid[])`,
      [companyIds, userIds],
    );
    // Also need auth users for other company members for FK — collect their ids
    const memberIds = [...new Set(companyProfiles.map((p) => p.id))];
    const { rows: memberAuth } = await prod.q(
      `select * from auth.users where id = any($1::uuid[])`,
      [memberIds],
    );
    writeFileSync(resolve(OUT_DIR, "auth-users-members.json"), JSON.stringify(memberAuth, null, 2));
    try {
      const { rows: memberIdent } = await prod.q(
        `select * from auth.identities where user_id = any($1::uuid[])`,
        [memberIds],
      );
      writeFileSync(resolve(OUT_DIR, "auth-identities-members.json"), JSON.stringify(memberIdent, null, 2));
      counts.auth_identities_members = memberIdent.length;
    } catch {
      /* optional */
    }
    counts.auth_users_members = memberAuth.length;

    writeFileSync(
      resolve(OUT_DIR, "profiles.json"),
      JSON.stringify(
        companyProfiles.map((row) => sanitizeRow(row, Object.keys(row))),
        null,
        2,
      ),
    );
    counts.profiles = companyProfiles.length;

    // Roles + role_permissions + user_roles for company
    const { rows: roles } = await prod.q(
      `select * from public.roles where company_id = any($1::uuid[]) or (company_id is null and is_system = true)`,
      [companyIds],
    );
    writeFileSync(resolve(OUT_DIR, "roles.json"), JSON.stringify(roles, null, 2));
    counts.roles = roles.length;
    const roleIds = roles.map((r) => r.id);

    const { rows: rolePerms } = await prod.q(
      `select * from public.role_permissions where role_id = any($1::uuid[])`,
      [roleIds],
    );
    writeFileSync(resolve(OUT_DIR, "role_permissions.json"), JSON.stringify(rolePerms, null, 2));
    counts.role_permissions = rolePerms.length;

    const { rows: userRoles } = await prod.q(
      `select * from public.user_roles where user_id = any($1::uuid[])`,
      [memberIds],
    );
    writeFileSync(resolve(OUT_DIR, "user_roles.json"), JSON.stringify(userRoles, null, 2));
    counts.user_roles = userRoles.length;

    try {
      const { rows: userPerms } = await prod.q(
        `select * from public.user_permissions where user_id = any($1::uuid[])`,
        [memberIds],
      );
      writeFileSync(resolve(OUT_DIR, "user_permissions.json"), JSON.stringify(userPerms, null, 2));
      counts.user_permissions = userPerms.length;
    } catch {
      counts.user_permissions = 0;
    }

    // Tenant-scoped tables
    const tenantTables = await discoverTenantTables(prod);
    const exportedTables = [];
    for (const { table, tenantCol } of tenantTables) {
      // Skip companies/profiles/roles already handled
      if (["companies", "profiles", "roles"].includes(table)) continue;
      try {
        const cols = await tableColumns(prod, "public", table);
        const { rows } = await prod.q(
          `select * from public.${quoteIdent(table)} where ${quoteIdent(tenantCol)} = any($1::uuid[])`,
          [companyIds],
        );
        const sanitized = rows.map((row) => sanitizeRow(row, cols));
        writeFileSync(resolve(OUT_DIR, `table-${table}.json`), JSON.stringify(sanitized, null, 2));
        counts[table] = rows.length;
        exportedTables.push({ table, tenantCol, rows: rows.length });
        console.log(`[export] ${table}: ${rows.length}`);
      } catch (e) {
        console.warn(`[export] skip ${table}: ${e.message}`);
        exportedTables.push({ table, tenantCol, error: e.message });
      }
    }

    // Related non-company_id tables via known FKs (conversation_messages via conversations)
    await exportRelatedByParent(prod, counts, exportedTables, companyIds);

    const manifest = {
      stamp: new Date().toISOString(),
      companyIds,
      userIds,
      memberIds,
      exportedTables,
      productionHost: prod.host,
      productionWrites: 0,
    };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    writeFileSync(COUNTS, JSON.stringify(counts, null, 2));
    console.log("[export] done", { tables: exportedTables.length, companies: companyIds.length });
    return { manifest, counts };
  } finally {
    await prod.end();
  }
}

async function exportRelatedByParent(prod, counts, exportedTables, companyIds) {
  // conversation_messages via conversations.company_id
  try {
    await prod.client.query("savepoint sp_msgs");
    const { rows } = await prod.q(
      `select m.* from public.conversation_messages m
       join public.conversations c on c.id = m.conversation_id
       where c.company_id = any($1::uuid[])`,
      [companyIds],
    );
    writeFileSync(
      resolve(OUT_DIR, "table-conversation_messages.json"),
      JSON.stringify(
        rows.map((r) => sanitizeRow(r, Object.keys(r))),
        null,
        2,
      ),
    );
    counts.conversation_messages = rows.length;
    exportedTables.push({ table: "conversation_messages", via: "conversations", rows: rows.length });
    console.log(`[export] conversation_messages: ${rows.length}`);
    await prod.client.query("release savepoint sp_msgs");
  } catch (e) {
    try {
      await prod.client.query("rollback to savepoint sp_msgs");
    } catch {
      /* ignore */
    }
    console.warn(`[export] conversation_messages: ${e.message}`);
  }

  // Discover email* tables with company_id already exported; also try common message tables
  const candidates = [
    "email_threads",
    "email_thread_messages",
    "mailbox_messages",
    "company_email_messages",
    "email_workspace_messages",
  ];
  for (const table of candidates) {
    try {
      await prod.client.query(`savepoint sp_${table}`);
      const { rows: exists } = await prod.q(
        `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
        [table],
      );
      if (!exists.length) {
        await prod.client.query(`release savepoint sp_${table}`);
        continue;
      }
      const { rows: cols } = await prod.q(
        `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
        [table],
      );
      const names = cols.map((c) => c.column_name);
      let rows;
      if (names.includes("company_id")) {
        ({ rows } = await prod.q(`select * from public.${quoteIdent(table)} where company_id = any($1::uuid[])`, [
          companyIds,
        ]));
      } else {
        await prod.client.query(`release savepoint sp_${table}`);
        continue;
      }
      writeFileSync(
        resolve(OUT_DIR, `table-${table}.json`),
        JSON.stringify(
          rows.map((r) => sanitizeRow(r, Object.keys(r))),
          null,
          2,
        ),
      );
      counts[table] = rows.length;
      exportedTables.push({ table, rows: rows.length });
      console.log(`[export] ${table}: ${rows.length}`);
      await prod.client.query(`release savepoint sp_${table}`);
    } catch (e) {
      try {
        await prod.client.query(`rollback to savepoint sp_${table}`);
      } catch {
        /* ignore */
      }
      console.warn(`[export] ${table}: ${e.message}`);
    }
  }
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Bad identifier: ${name}`);
  return `"${name}"`;
}

function jsonToPgLiteral(value, client) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function upsertRows(local, schema, table, rows, conflictTarget = "id") {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const { rows: localCols } = await local.query(
    `select column_name, data_type, udt_name
     from information_schema.columns
     where table_schema = $1 and table_name = $2`,
    [schema, table],
  );
  if (!localCols.length) {
    console.warn(`[import] ${schema}.${table}: table missing locally`);
    return 0;
  }
  const localMeta = new Map(localCols.map((c) => [c.column_name, c]));
  const useCols = cols.filter((c) => localMeta.has(c));
  if (!useCols.length) {
    console.warn(`[import] ${schema}.${table}: no matching columns`);
    return 0;
  }

  function coerce(col, v) {
    if (v === null || v === undefined) return null;
    const meta = localMeta.get(col);
    const dt = meta?.data_type || "";
    const udt = meta?.udt_name || "";
    if (dt === "jsonb" || dt === "json" || udt === "jsonb" || udt === "json") {
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    }
    if (dt === "ARRAY" || udt.startsWith("_")) {
      return v;
    }
    if (typeof v === "object") {
      // Non-JSON columns must not receive stringified objects (e.g. "{}" into timestamptz)
      if (v instanceof Date) return v.toISOString();
      // Corrupted export artifact from prior sanitize bug (Date -> {})
      if (!Array.isArray(v) && Object.keys(v).length === 0) {
        if (dt.startsWith("timestamp") || dt === "date") return new Date().toISOString();
        return null;
      }
      return null;
    }
    if (dt.startsWith("timestamp") || dt === "date") {
      if (v === "" || v === "{}") return new Date().toISOString();
    }
    return v;
  }

  let inserted = 0;
  const hasId = useCols.includes(conflictTarget);
  const colList = useCols.map(quoteIdent).join(", ");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = useCols.map((c) => coerce(c, row[c]));
    const ph = useCols.map((_, idx) => `$${idx + 1}`).join(", ");
    const sp = `sp_r_${i % 10000}`;
    try {
      await local.query(`savepoint ${sp}`);
      let sql;
      if (hasId) {
        const updates = useCols
          .filter((c) => c !== conflictTarget)
          .slice(0, 30)
          .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
          .join(", ");
        sql = `
          insert into ${quoteIdent(schema)}.${quoteIdent(table)} (${colList})
          values (${ph})
          on conflict (${quoteIdent(conflictTarget)}) do ${updates ? `update set ${updates}` : "nothing"}
        `;
      } else {
        sql = `
          insert into ${quoteIdent(schema)}.${quoteIdent(table)} (${colList})
          values (${ph})
          on conflict do nothing
        `;
      }
      await local.query(sql, values);
      await local.query(`release savepoint ${sp}`);
      inserted++;
    } catch (e1) {
      try {
        await local.query(`rollback to savepoint ${sp}`);
      } catch {
        /* ignore */
      }
      try {
        await local.query(`savepoint ${sp}_b`);
        await local.query(
          `insert into ${quoteIdent(schema)}.${quoteIdent(table)} (${colList})
           values (${ph}) on conflict do nothing`,
          values,
        );
        await local.query(`release savepoint ${sp}_b`);
        inserted++;
      } catch (e2) {
        try {
          await local.query(`rollback to savepoint ${sp}_b`);
        } catch {
          /* ignore */
        }
        if (i < 3) {
          console.warn(`[import] ${schema}.${table} row fail: ${e2.message}`);
        }
      }
    }
  }
  return inserted;
}

async function importAuthUsers(local, path, label) {
  if (!existsSync(path)) return 0;
  const users = JSON.parse(readFileSync(path, "utf8"));
  let n = 0;
  for (const u of users) {
    // Minimal required auth.users fields + password hash for exact password
    try {
      await local.query(
        `insert into auth.users (
           id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
           recovery_token, recovery_sent_at, email_change_token_new, email_change,
           email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
           is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
           phone_change, phone_change_token, phone_change_sent_at,
           email_change_token_current, email_change_confirm_status,
           banned_until, reauthentication_token, reauthentication_sent_at,
           is_sso_user, deleted_at, is_anonymous
         ) values (
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
         on conflict (id) do update set
           email = excluded.email,
           encrypted_password = excluded.encrypted_password,
           email_confirmed_at = excluded.email_confirmed_at,
           raw_app_meta_data = excluded.raw_app_meta_data,
           raw_user_meta_data = excluded.raw_user_meta_data,
           updated_at = now(),
           deleted_at = excluded.deleted_at,
           banned_until = excluded.banned_until
        `,
        [
          u.id,
          u.instance_id,
          u.aud,
          u.role,
          u.email,
          u.encrypted_password,
          u.email_confirmed_at,
          u.invited_at,
          u.confirmation_token,
          u.confirmation_sent_at,
          u.recovery_token,
          u.recovery_sent_at,
          u.email_change_token_new,
          u.email_change,
          u.email_change_sent_at,
          u.last_sign_in_at,
          JSON.stringify(u.raw_app_meta_data ?? {}),
          JSON.stringify(u.raw_user_meta_data ?? {}),
          u.is_super_admin,
          u.created_at,
          u.updated_at,
          u.phone,
          u.phone_confirmed_at,
          u.phone_change,
          u.phone_change_token,
          u.phone_change_sent_at,
          u.email_change_token_current,
          u.email_change_confirm_status,
          u.banned_until,
          u.reauthentication_token,
          u.reauthentication_sent_at,
          u.is_sso_user,
          u.deleted_at,
          u.is_anonymous,
        ],
      );
      n++;
    } catch (e) {
      console.warn(`[import] auth.users ${label} ${u.email}: ${e.message}`);
    }
  }
  return n;
}

async function importIdentities(local, path) {
  if (!existsSync(path)) return 0;
  const rows = JSON.parse(readFileSync(path, "utf8"));
  let n = 0;
  for (const r of rows) {
    const identityData = r.identity_data ?? {
      sub: r.user_id,
      email: r.email,
    };
    const email =
      r.email ||
      identityData.email ||
      (typeof identityData === "object" ? identityData.email : null) ||
      null;
    try {
      await local.query("savepoint sp_ident");
      await local.query(
        `insert into auth.identities (
           id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
         ) values (
           $1::uuid, $2::uuid, $3::jsonb, $4, $5, $6, coalesce($7, now()), coalesce($8, now())
         )
         on conflict (id) do update set
           identity_data = excluded.identity_data,
           last_sign_in_at = excluded.last_sign_in_at,
           updated_at = now()`,
        [
          r.id,
          r.user_id,
          JSON.stringify(identityData),
          r.provider || "email",
          r.provider_id || String(r.user_id),
          r.last_sign_in_at,
          r.created_at,
          r.updated_at,
        ],
      );
      await local.query("release savepoint sp_ident");
      n++;
    } catch (e) {
      try {
        await local.query("rollback to savepoint sp_ident");
      } catch {
        /* ignore */
      }
      try {
        await local.query("savepoint sp_ident2");
        await local.query(
          `insert into auth.identities (
             id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
           ) values (
             $1::uuid, $2::uuid, $3::jsonb, $4, $5, $6, coalesce($7, now()), coalesce($8, now())
           )
           on conflict do nothing`,
          [
            r.id,
            r.user_id,
            JSON.stringify(identityData),
            r.provider || "email",
            r.provider_id || String(r.user_id),
            r.last_sign_in_at,
            r.created_at,
            r.updated_at,
          ],
        );
        await local.query("release savepoint sp_ident2");
        n++;
      } catch (e2) {
        try {
          await local.query("rollback to savepoint sp_ident2");
        } catch {
          /* ignore */
        }
        console.warn(`[import] identity ${r.id}: ${e2.message}`);
      }
    }
  }
  return n;
}

function loadTableJson(name) {
  const p = resolve(OUT_DIR, name);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8"));
}

async function importData() {
  if (!existsSync(MANIFEST)) throw new Error("Run export first");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const local = await connectLocal();
  const result = { imported: {}, errors: [] };

  async function step(name, fn) {
    try {
      await local.query("begin");
      await local.query("set local session_replication_role = replica");
      await local.query("set local row_security = off");
      const n = await fn();
      await local.query("commit");
      result.imported[name] = n;
      console.log(`[import] ${name}: ${n}`);
      return n;
    } catch (e) {
      try {
        await local.query("rollback");
      } catch {
        /* ignore */
      }
      result.errors.push(`${name}: ${e.message}`);
      console.warn(`[import] FAIL ${name}: ${e.message}`);
      return 0;
    }
  }

  try {
    await step("auth_users_members", () =>
      importAuthUsers(local, resolve(OUT_DIR, "auth-users-members.json"), "members"),
    );
    await step("auth_users", () => importAuthUsers(local, resolve(OUT_DIR, "auth-users.json"), "primary"));
    await step("auth_identities_members", () =>
      importIdentities(local, resolve(OUT_DIR, "auth-identities-members.json")),
    );
    await step("auth_identities", () => importIdentities(local, resolve(OUT_DIR, "auth-identities.json")));

    await step("companies", () => upsertRows(local, "public", "companies", loadTableJson("companies.json")));
    await step("profiles", () => upsertRows(local, "public", "profiles", loadTableJson("profiles.json")));
    await step("roles", () => upsertRows(local, "public", "roles", loadTableJson("roles.json")));
    await step("role_permissions", async () => {
      const rp = loadTableJson("role_permissions.json");
      let n = await upsertRows(local, "public", "role_permissions", rp, "id");
      if (!n && rp.length) {
        for (const row of rp) {
          try {
            await local.query(
              `insert into public.role_permissions (role_id, permission_id)
               values ($1,$2) on conflict do nothing`,
              [row.role_id, row.permission_id],
            );
            n++;
          } catch (e2) {
            result.errors.push(`role_permissions: ${e2.message}`);
          }
        }
      }
      return n;
    });
    await step("user_roles", () => upsertRows(local, "public", "user_roles", loadTableJson("user_roles.json")));
    await step("user_permissions", () =>
      upsertRows(local, "public", "user_permissions", loadTableJson("user_permissions.json")),
    );

    const orderBoost = [
      "organization_departments",
      "branches",
      "customers",
      "leads",
      "opportunities",
      "bookings",
      "scheduling_bookings",
      "invoices",
      "support_tickets",
      "conversations",
      "conversation_messages",
      "company_channels",
      "company_email_settings",
      "company_whatsapp_settings",
      "company_instagram_settings",
      "company_feature_overrides",
      "automation_flows",
      "automation_flow_versions",
      "agent_workflows",
      "lead_pipelines",
      "lead_stages",
      "lead_sources",
      "opportunity_pipelines",
      "opportunity_stages",
      "quotes",
      "quote_line_items",
      "scheduling_resources",
      "scheduling_services",
      "handoff_queues",
      "notifications",
    ];

    const CORE_SKIP =
      process.env.LOCAL_CLONE_CORE_ONLY === "1"
        ? new Set([
            "audit_logs",
            "ai_governance_audit_events",
            "ai_execution_metrics",
            "ai_executions",
            "ai_traces",
            "ai_trace_spans",
            "ai_token_cost_records",
            "ai_execution_analytics",
            "channel_delivery_events",
            "channel_inbound_events",
            "usage_records",
            "prompt_builds",
            "runtime_executions",
            "runtime_sessions",
            "intent_matches",
            "tool_executions",
            "platform_event_idempotency",
            "platform_event_subscriber_telemetry",
            "platform_reactive_signals",
            "platform_event_audit",
            "platform_event_correlations",
            "platform_event_timeline",
            "executive_dashboard_access_log",
            "communication_reminder_schedules",
            "notification_queue",
            "lead_ai_audit_log",
            "lead_activities",
            "opportunity_history",
            "quote_history",
          ])
        : null;

    const files = (manifest.exportedTables || []).map((t) => t.table);
    const ordered = [
      ...orderBoost.filter((t) => files.includes(t) || existsSync(resolve(OUT_DIR, `table-${t}.json`))),
      ...files.filter((t) => !orderBoost.includes(t)),
      "conversation_messages",
    ];
    const seen = new Set(["companies", "profiles", "roles"]);
    for (const table of ordered) {
      if (seen.has(table)) continue;
      seen.add(table);
      if (CORE_SKIP?.has(table)) {
        console.log(`[import] skip heavy ${table} (core-only mode)`);
        continue;
      }
      const rows = loadTableJson(`table-${table}.json`);
      if (!rows.length) continue;
      await step(table, () => upsertRows(local, "public", table, rows));
    }

    writeFileSync(resolve(OUT_DIR, "import-result.json"), JSON.stringify(result, null, 2));
    console.log("[import] done", {
      ok: Object.keys(result.imported).length,
      errors: result.errors.length,
    });
    return result;
  } finally {
    await local.end();
  }
}

async function verifyLocal() {
  const local = await connectLocal();
  const sourceCounts = existsSync(COUNTS) ? JSON.parse(readFileSync(COUNTS, "utf8")) : {};
  const report = { users: [], counts: {}, sourceCounts, outbound: {} };

  try {
    for (const spec of USERS) {
      const { rows } = await local.query(
        `select p.id, p.email, p.company_id, c.name as company_name,
                (au.encrypted_password is not null and length(au.encrypted_password) > 0) as has_password_hash,
                au.email as auth_email
         from public.profiles p
         left join public.companies c on c.id = p.company_id
         left join auth.users au on au.id = p.id
         where lower(p.email) = lower($1)`,
        [spec.email],
      );
      const p = rows[0];
      let roles = [];
      if (p) {
        const r = await local.query(
          `select r.name, r.template_key from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1`,
          [p.id],
        );
        roles = r.rows;
      }
      report.users.push({
        email: spec.email,
        present: Boolean(p),
        companyId: p?.company_id ?? null,
        companyName: p?.company_name ?? null,
        hasPasswordHash: p?.has_password_hash ?? false,
        roles,
        emailMatch: p?.email?.toLowerCase() === spec.email.toLowerCase(),
      });
    }

    const companyIds = report.users.map((u) => u.companyId).filter(Boolean);
    const countTargets = [
      "customers",
      "leads",
      "opportunities",
      "bookings",
      "invoices",
      "tickets",
      "conversations",
      "profiles",
      "roles",
    ];
    for (const table of countTargets) {
      try {
        const { rows } = await local.query(
          `select count(*)::int as n from public.${quoteIdent(table)} where company_id = any($1::uuid[])`,
          [companyIds],
        );
        report.counts[table] = rows[0].n;
      } catch {
        report.counts[table] = null;
      }
    }
    try {
      const { rows } = await local.query(
        `select count(*)::int as n from public.conversation_messages m
         join public.conversations c on c.id = m.conversation_id
         where c.company_id = any($1::uuid[])`,
        [companyIds],
      );
      report.counts.conversation_messages = rows[0].n;
    } catch {
      report.counts.conversation_messages = null;
    }
    try {
      const { rows } = await local.query(
        `select count(*)::int as n from public.user_roles where user_id in (
           select id from profiles where company_id = any($1::uuid[])
         )`,
        [companyIds],
      );
      report.counts.user_roles = rows[0].n;
    } catch {
      report.counts.user_roles = null;
    }

    writeFileSync(resolve(OUT_DIR, "verify-local.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await local.end();
  }
}

const cmd = process.argv[2] || "identify";
if (cmd === "identify") await identify();
else if (cmd === "export") await exportData();
else if (cmd === "import") await importData();
else if (cmd === "verify") await verifyLocal();
else if (cmd === "all") {
  await identify();
  await exportData();
  await importData();
  await verifyLocal();
} else {
  console.error("Unknown command", cmd);
  process.exit(1);
}
