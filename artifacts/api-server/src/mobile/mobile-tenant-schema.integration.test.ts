/**
 * Local-only verification that migration 445 objects support tenant host lookup.
 * Never uses hosted production credentials.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { decideMobileAccess, instanceSubdomain, readInstanceHostname } from "./mobile-access.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const require = createRequire(resolve(root, "lib/db/package.json"));
const pg = require("pg") as typeof import("pg");

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Tenant schema integration refuses a non-loopback database.");
  }
}

describe("mobile tenant schema local integration", () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  let available = false;

  before(async () => {
    assertLoopback(databaseUrl);
    try {
      const result = await pool.query(`
        select
          to_regclass('public.platform_admin_contexts') as admin_ctx,
          exists (
            select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'companies'
               and column_name = 'subdomain'
          ) as has_subdomain
      `);
      available = Boolean(result.rows[0]?.admin_ctx) && Boolean(result.rows[0]?.has_subdomain);
    } catch {
      available = false;
    }
  });

  after(async () => {
    await pool.end();
  });

  it("resolves a company subdomain and rejects a foreign member", async (t) => {
    if (!available) {
      t.skip("local migration 445 objects are not present");
      return;
    }

    const hostname = readInstanceHostname("https://demo-alpha-trial-company.valueor.org");
    const subdomain = instanceSubdomain(hostname);
    assert.equal(subdomain, "demo-alpha-trial-company");

    const company = await pool.query(
      `select id::text, name, status, approval_status, subdomain
         from public.companies
        where subdomain = $1`,
      [subdomain],
    );
    assert.equal(company.rowCount, 1);
    const row = company.rows[0];

    const member = decideMobileAccess({
      hostname,
      company: {
        id: row.id,
        name: row.name,
        status: row.status,
        approvalStatus: row.approval_status,
        subdomain: row.subdomain,
      },
      profileCompanyId: row.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(member.ok, true);
    if (member.ok) {
      assert.equal(member.scope, "tenant");
      assert.equal(member.company?.id, row.id);
    }

    const foreign = decideMobileAccess({
      hostname,
      company: {
        id: row.id,
        name: row.name,
        status: row.status,
        approvalStatus: row.approval_status,
        subdomain: row.subdomain,
      },
      profileCompanyId: "d0000010-0001-4001-8001-000000000003",
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.code, "forbidden");

    const adminTable = await pool.query(`
      select column_name
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'platform_admin_contexts'
         and column_name in ('actor_id', 'company_id', 'revoked_at', 'expires_at')
       order by 1
    `);
    assert.deepEqual(
      adminTable.rows.map((item: { column_name: string }) => item.column_name),
      ["actor_id", "company_id", "expires_at", "revoked_at"],
    );
  });
});
