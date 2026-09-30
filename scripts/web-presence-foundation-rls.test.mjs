/**
 * Web Presence Phase 0 + 1 — live local RLS / trigger verification (migrations 397–399;
 * widget channel activation updated by 400).
 *
 * LOCAL ONLY. Every scenario runs inside a transaction that is rolled back.
 * Run: node --test scripts/web-presence-foundation-rls.test.mjs
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const LOCAL_DB_URL = process.env.WEB_PRESENCE_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(LOCAL_DB_URL)) {
  throw new Error("Refusing to run: web presence RLS test is local-only (127.0.0.1:54322).");
}

const CO_A = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const USER_A = "e6ee54a8-be96-4277-aede-319a3d049ee8";
const CO_B = "d0000010-0001-4001-8001-000000000002";
const USER_B = "d0000002-0001-4001-8001-000000000002";
const CO_SUSPENDED = "d0000010-0001-4001-8001-000000000001";
const USER_SUSPENDED = "d0000002-0001-4001-8001-000000000001";
const FOREIGN_CONVERSATION = "d0000110-0001-4001-8001-000000000002";

const client = new pg.Client({ connectionString: LOCAL_DB_URL });

before(async () => {
  await client.connect();
});

after(async () => {
  await client.end();
});

async function inTx(fn) {
  await client.query("begin");
  try {
    await seed();
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function asUser(sub, fn) {
  await client.query("savepoint sp_as_user");
  try {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn();
  } catch (error) {
    try {
      await client.query("rollback to savepoint sp_as_user");
    } catch {
      /* already aborted; outer expectError / inTx recovers */
    }
    throw error;
  } finally {
    try {
      await client.query("release savepoint sp_as_user");
    } catch {
      /* rolled back already */
    }
    try {
      await client.query("reset role");
      await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
      await client.query(`select set_config('request.jwt.claim.role', '', true)`);
      await client.query(`select set_config('request.jwt.claims', '', true)`);
    } catch {
      /* aborted transaction — do not replace the original error */
    }
  }
}

async function asAnon(fn) {
  await client.query("savepoint sp_as_anon");
  try {
    await client.query(`select set_config('request.jwt.claim.role', 'anon', true)`);
    await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await client.query("set local role anon");
    return await fn();
  } catch (error) {
    try {
      await client.query("rollback to savepoint sp_as_anon");
    } catch {
      /* already aborted */
    }
    throw error;
  } finally {
    try {
      await client.query("release savepoint sp_as_anon");
    } catch {
      /* rolled back */
    }
    try {
      await client.query("reset role");
      await client.query(`select set_config('request.jwt.claim.role', '', true)`);
      await client.query(`select set_config('request.jwt.claims', '', true)`);
    } catch {
      /* do not replace original error */
    }
  }
}

async function expectError(promiseFactory, pattern) {
  await client.query("savepoint sp_expect");
  try {
    await promiseFactory();
  } catch (error) {
    await client.query("rollback to savepoint sp_expect");
    if (pattern) assert.match(String(error.message), pattern);
    return error;
  }
  await client.query("release savepoint sp_expect");
  assert.fail(`expected error${pattern ? ` matching ${pattern}` : ""}`);
}

async function seed() {
  await client.query(
    `insert into public.user_permissions (user_id, permission_id)
     select u.user_id, p.id
     from (values ($1::uuid), ($2::uuid), ($3::uuid)) as u(user_id)
     cross join public.permissions p
     where p.code in ('web_presence.view', 'web_presence.manage')
     on conflict do nothing`,
    [USER_A, USER_B, USER_SUSPENDED],
  );
  await client.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     select c.company_id, f.code, 'enabled', 'manual', true, 'web presence rls test'
     from (values ($1::uuid), ($2::uuid), ($3::uuid)) as c(company_id)
     cross join (values ('web_presence_page'), ('web_chat_widget')) as f(code)
     on conflict (company_id, feature_code) where (is_active = true)
     do update set override_state = 'enabled', source = 'manual', reason = excluded.reason`,
    [CO_A, CO_B, CO_SUSPENDED],
  );
}

async function provision(user, companyId, name = "Site") {
  return asUser(user, async () => {
    const { rows } = await client.query(`select public.web_presence_provision_widget($1, $2) as id`, [companyId, name]);
    return rows[0].id;
  });
}

async function widgetRow(id) {
  const { rows } = await client.query(`select * from public.web_chat_widgets where id = $1`, [id]);
  return rows[0];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Web Presence foundation RLS (serialized, one client)", { concurrency: false }, () => {
describe("1–2. Feature definitions + permission mappings", () => {
  it("feature definitions, flags, permissions and mappings exist", async () => {
    const defs = await client.query(
      `select code, is_billable, requires_subscription, default_enabled, is_active
       from public.feature_definitions where code in ('web_presence_page','web_chat_widget') order by code`,
    );
    assert.deepEqual(
      defs.rows.map((r) => r.code),
      ["web_chat_widget", "web_presence_page"],
    );
    for (const row of defs.rows) {
      assert.equal(row.is_billable, true);
      assert.equal(row.requires_subscription, true);
      assert.equal(row.default_enabled, false);
      assert.equal(row.is_active, true);
    }
    const flags = await client.query(
      `select count(*)::int as n from public.feature_flags where feature_code in ('web_presence_page','web_chat_widget')`,
    );
    assert.equal(flags.rows[0].n, 2);
    const perms = await client.query(
      `select count(*)::int as n from public.permissions where code in ('web_presence.view','web_presence.manage')`,
    );
    assert.equal(perms.rows[0].n, 2);
    const mappings = await client.query(
      `select feature_code, permission_code from public.feature_definition_permissions
       where permission_code like 'web_presence.%' and is_active order by 1, 2`,
    );
    assert.deepEqual(mappings.rows, [
      { feature_code: "web_chat_widget", permission_code: "web_presence.manage" },
      { feature_code: "web_chat_widget", permission_code: "web_presence.view" },
      { feature_code: "web_presence_page", permission_code: "web_presence.manage" },
      { feature_code: "web_presence_page", permission_code: "web_presence.view" },
    ]);
    const templates = await client.query(
      `select template_key, permission_code from public.platform_role_template_permissions
       where permission_code like 'web_presence.%' order by 1, 2`,
    );
    assert.deepEqual(templates.rows, [
      { template_key: "admin", permission_code: "web_presence.manage" },
      { template_key: "admin", permission_code: "web_presence.view" },
      { template_key: "manager", permission_code: "web_presence.view" },
    ]);
  });

  it("generic web_chat stays non-commercial and unmapped", async () => {
    const { rows } = await client.query(
      `select internal.resolve_channel_commercial_feature_code('web_chat') as feature,
              internal.is_noncommercial_channel_catalog_key('web_chat') as noncommercial`,
    );
    assert.equal(rows[0].feature, null);
    assert.equal(rows[0].noncommercial, true);
  });

  it("without the feature, RBAC alone does not grant access", async () => {
    await client.query("begin");
    try {
      await client.query(
        `insert into public.user_permissions (user_id, permission_id)
         select $1, id from public.permissions where code in ('web_presence.view','web_presence.manage')
         on conflict do nothing`,
        [USER_A],
      );
      await client.query(
        `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
         values ($1, 'web_chat_widget', 'disabled', 'manual', true, 'web presence rls test'),
                ($1, 'web_presence_page', 'disabled', 'manual', true, 'web presence rls test')
         on conflict (company_id, feature_code) where (is_active = true)
         do update set override_state = 'disabled', source = 'manual', reason = excluded.reason`,
        [CO_A],
      );
      const enabled = await client.query(
        `select public.is_feature_enabled($1, 'web_chat_widget') as widget,
                public.is_feature_enabled($1, 'web_presence_page') as page`,
        [CO_A],
      );
      assert.deepEqual(enabled.rows[0], { widget: false, page: false });
      await expectError(() => provision(USER_A, CO_A), /Forbidden/);
      await asUser(USER_A, async () => {
        await expectError(
          () => client.query(`insert into public.web_presence_pages (company_id) values ($1)`, [CO_A]),
          /row-level security/,
        );
      });
    } finally {
      await client.query("rollback");
    }
  });
});

describe("3. Cross-company isolation", () => {
  it("staff cannot read, write or reference another company's config", async () => {
    await inTx(async () => {
      const widgetA = await provision(USER_A, CO_A, "A site");
      const widgetB = await provision(USER_B, CO_B, "B site");

      await asUser(USER_A, async () => {
        const visible = await client.query(`select id from public.web_chat_widgets`);
        const ids = visible.rows.map((r) => r.id);
        assert.ok(ids.includes(widgetA));
        assert.ok(!ids.includes(widgetB));

        const upd = await client.query(`update public.web_chat_widgets set greeting = 'x' where id = $1`, [widgetB]);
        assert.equal(upd.rowCount, 0);

        await expectError(
          () => client.query(`insert into public.web_presence_pages (company_id) values ($1)`, [CO_B]),
          /row-level security/,
        );
        await expectError(
          () => client.query(`select public.web_presence_provision_widget($1, 'x')`, [CO_B]),
          /Forbidden/,
        );

        await client.query(`insert into public.web_presence_pages (company_id) values ($1)`, [CO_A]);
        await expectError(
          () => client.query(`update public.web_presence_pages set widget_id = $1 where company_id = $2`, [widgetB, CO_A]),
          /Widget must belong to the same company/,
        );
      });

      const pageB = await asUser(USER_B, async () => {
        const { rows } = await client.query(`select id from public.web_presence_pages`);
        return rows;
      });
      assert.equal(pageB.length, 0);
    });
  });

  it("page slug reference must be the same company's portal row", async () => {
    await inTx(async () => {
      const portalB = await client.query(
        `insert into public.customer_portal_settings (company_id, slug, enabled)
         values ($1, $2, false)
         on conflict (company_id) do update set updated_at = now()
         returning id`,
        [CO_B, `wp-test-${randomBytes(4).toString("hex")}`],
      );
      await asUser(USER_A, async () => {
        await expectError(
          () =>
            client.query(`insert into public.web_presence_pages (company_id, portal_settings_id) values ($1, $2)`, [
              CO_A,
              portalB.rows[0].id,
            ]),
          /Portal settings \(slug\) must belong to the same company/,
        );
      });
    });
  });
});

describe("4. Suspended company", () => {
  it("suspended tenant staff are blocked even with RBAC + feature overrides", async () => {
    await inTx(async () => {
      await expectError(() => provision(USER_SUSPENDED, CO_SUSPENDED), /Forbidden/);

      await client.query(`insert into public.web_presence_pages (company_id) values ($1)`, [CO_SUSPENDED]);
      await asUser(USER_SUSPENDED, async () => {
        const { rows } = await client.query(`select id from public.web_presence_pages`);
        assert.equal(rows.length, 0);
        const upd = await client.query(`update public.web_presence_pages set enabled = true where company_id = $1`, [
          CO_SUSPENDED,
        ]);
        assert.equal(upd.rowCount, 0);
      });
    });
  });

  it("every new table has the restrictive suspended lock policy (392 convention)", async () => {
    const { rows } = await client.query(
      `select c.relname, p.polname, p.polpermissive, p.polcmd
       from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname in ('web_presence_pages','web_chat_widgets','web_chat_visitor_sessions')
         and p.polname like 'rls_workspace_lock_suspended_%'
       order by 1`,
    );
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.polpermissive, false, row.relname);
      assert.equal(row.polcmd, "*", row.relname);
      assert.equal(row.polname, `rls_workspace_lock_suspended_${row.relname}`);
    }
  });
});

describe("5. public_key", () => {
  it("is server-generated, random, unique, immutable for clients and never the company id", async () => {
    await inTx(async () => {
      const w1 = await provision(USER_A, CO_A, "one");
      const w2 = await provision(USER_A, CO_A, "two");
      const r1 = await widgetRow(w1);
      const r2 = await widgetRow(w2);
      assert.match(r1.public_key, /^wcw_[0-9a-f]{48}$/);
      assert.notEqual(r1.public_key, r2.public_key);
      assert.ok(!r1.public_key.includes(CO_A.replace(/-/g, "")));
      assert.ok(!r1.public_key.includes(CO_A));

      await asUser(USER_A, async () => {
        await expectError(
          () => client.query(`update public.web_chat_widgets set public_key = $1 where id = $2`, [r2.public_key, w1]),
          /public_key cannot be changed by clients/,
        );
      });

      await expectError(
        () => client.query(`update public.web_chat_widgets set public_key = $1 where id = $2`, [r2.public_key, w1]),
        /duplicate key value|idx_web_chat_widgets_public_key/,
      );

      const channel = await client.query(
        `insert into public.company_channels (company_id, channel_id, display_name, provider)
         select $1, id, 'extra', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
         returning id`,
        [CO_A],
      );
      const forced = await client.query(
        `insert into public.web_chat_widgets (company_id, company_channel_id, public_key)
         values ($1, $2, $3) returning public_key`,
        [CO_A, channel.rows[0].id, r1.public_key],
      );
      assert.notEqual(forced.rows[0].public_key, r1.public_key);
      assert.match(forced.rows[0].public_key, /^wcw_[0-9a-f]{48}$/);
    });
  });
});

describe("6. Widget channel reference", () => {
  it("cannot reference another company's channel or the generic internal web_chat channel", async () => {
    await inTx(async () => {
      const widgetB = await provision(USER_B, CO_B, "B");
      const channelB = (await widgetRow(widgetB)).company_channel_id;

      await expectError(
        () =>
          client.query(`insert into public.web_chat_widgets (company_id, company_channel_id) values ($1, $2)`, [
            CO_A,
            channelB,
          ]),
        /Widget channel must belong to the same company/,
      );

      const generic = await client.query(
        `insert into public.company_channels (company_id, channel_id, display_name, provider)
         select $1, id, 'internal', 'generic.web_chat' from public.communication_channels where key = 'web_chat'
         returning id`,
        [CO_A],
      );
      await expectError(
        () =>
          client.query(`insert into public.web_chat_widgets (company_id, company_channel_id) values ($1, $2)`, [
            CO_A,
            generic.rows[0].id,
          ]),
        /dedicated valueor\.web_widget channel/,
      );

      const widgetA = await provision(USER_A, CO_A, "A");
      await expectError(
        () =>
          client.query(`update public.web_chat_widgets set company_channel_id = $1 where id = $2`, [
            generic.rows[0].id,
            widgetA,
          ]),
        /company_channel_id is immutable/,
      );
    });
  });
});

describe("7. AI Employee reference", () => {
  it("must belong to the same company", async () => {
    await inTx(async () => {
      const widgetA = await provision(USER_A, CO_A, "A");
      const empB = await client.query(
        `insert into public.ai_employees (company_id, name, display_name) values ($1, 'wp-b', 'WP B') returning id`,
        [CO_B],
      );
      const empA = await client.query(
        `insert into public.ai_employees (company_id, name, display_name) values ($1, 'wp-a', 'WP A') returning id`,
        [CO_A],
      );
      await asUser(USER_A, async () => {
        await expectError(
          () => client.query(`update public.web_chat_widgets set ai_employee_id = $1 where id = $2`, [empB.rows[0].id, widgetA]),
          /AI Employee must belong to the same company/,
        );
        const ok = await client.query(`update public.web_chat_widgets set ai_employee_id = $1 where id = $2`, [
          empA.rows[0].id,
          widgetA,
        ]);
        assert.equal(ok.rowCount, 1);
      });
      await client.query(`update public.ai_employees set status = 'archived' where id = $1`, [empA.rows[0].id]);
      await client.query(`update public.web_chat_widgets set ai_employee_id = null where id = $1`, [widgetA]);
      await expectError(
        () => client.query(`update public.web_chat_widgets set ai_employee_id = $1 where id = $2`, [empA.rows[0].id, widgetA]),
        /AI Employee is not available/,
      );
    });
  });
});

describe("8. Visitor token storage", () => {
  it("stores only the SHA-256 hash and rejects raw tokens", async () => {
    await inTx(async () => {
      const widgetA = await provision(USER_A, CO_A, "A");
      const raw = randomBytes(32).toString("base64url");
      const inserted = await client.query(
        `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, expires_at)
         values ($1, $2, internal.web_chat_visitor_token_hash($3), $4, now() + interval '1 day')
         returning *`,
        [CO_A, widgetA, raw, `visitor-${randomBytes(8).toString("hex")}`],
      );
      const row = inserted.rows[0];
      assert.equal(row.token_hash, sha256(raw));
      assert.ok(!Object.values(row).some((value) => typeof value === "string" && value.includes(raw)));

      await expectError(
        () =>
          client.query(
            `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, expires_at)
             values ($1, $2, $3, $4, now() + interval '1 day')`,
            [CO_A, widgetA, raw, `visitor-${randomBytes(8).toString("hex")}`],
          ),
        /web_chat_visitor_sessions_token_hash_sha256/,
      );

      await asUser(USER_A, async () => {
        await expectError(
          () =>
            client.query(
              `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, expires_at)
               values ($1, $2, $3, $4, now() + interval '1 day')`,
              [CO_A, widgetA, sha256("x"), `visitor-${randomBytes(8).toString("hex")}`],
            ),
          /permission denied/,
        );
        await expectError(
          () => client.query(`update public.web_chat_visitor_sessions set token_hash = $1`, [sha256("y")]),
          /permission denied/,
        );
        await expectError(() => client.query(`select internal.web_chat_visitor_token_hash('x')`), /permission denied/);
      });
    });
  });
});

describe("9. Visitor session company isolation", () => {
  it("cannot cross companies via widget, conversation or staff reads", async () => {
    await inTx(async () => {
      const widgetA = await provision(USER_A, CO_A, "A");
      const widgetB = await provision(USER_B, CO_B, "B");

      await expectError(
        () =>
          client.query(
            `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, expires_at)
             values ($1, $2, $3, $4, now() + interval '1 day')`,
            [CO_A, widgetB, sha256(randomBytes(8).toString("hex")), "visitor-cross-company-1"],
          ),
        /widget must belong to the same company/,
      );

      await expectError(
        () =>
          client.query(
            `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, conversation_id, expires_at)
             values ($1, $2, $3, $4, $5, now() + interval '1 day')`,
            [CO_A, widgetA, sha256(randomBytes(8).toString("hex")), "visitor-cross-company-2", FOREIGN_CONVERSATION],
          ),
        /conversation must belong to the same company/,
      );

      const sessionB = await client.query(
        `insert into public.web_chat_visitor_sessions (company_id, widget_id, token_hash, visitor_id, expires_at)
         values ($1, $2, $3, $4, now() + interval '1 day') returning id`,
        [CO_B, widgetB, sha256(randomBytes(8).toString("hex")), "visitor-company-b-000"],
      );

      await asUser(USER_A, async () => {
        const { rows } = await client.query(`select id from public.web_chat_visitor_sessions where id = $1`, [
          sessionB.rows[0].id,
        ]);
        assert.equal(rows.length, 0);
        const upd = await client.query(`update public.web_chat_visitor_sessions set blocked = true where id = $1`, [
          sessionB.rows[0].id,
        ]);
        assert.equal(upd.rowCount, 0);
      });

      await asUser(USER_B, async () => {
        const upd = await client.query(`update public.web_chat_visitor_sessions set blocked = true where id = $1`, [
          sessionB.rows[0].id,
        ]);
        assert.equal(upd.rowCount, 1);
      });

      await expectError(
        () =>
          client.query(`update public.web_chat_visitor_sessions set company_id = $1 where id = $2`, [
            CO_A,
            sessionB.rows[0].id,
          ]),
        /identity columns are immutable/,
      );
    });
  });
});

describe("10. Internal AI chat unaffected", () => {
  it("widget channel is never default, provisioned disabled, activation follows widget.enabled (400), provider immutable", async () => {
    await inTx(async () => {
      const widgetA = await provision(USER_A, CO_A, "A");
      const channelId = (await widgetRow(widgetA)).company_channel_id;
      const ch = await client.query(
        `select cc.provider, cc.is_default, cc.is_enabled, cc.status, k.key
         from public.company_channels cc join public.communication_channels k on k.id = cc.channel_id
         where cc.id = $1`,
        [channelId],
      );
      assert.deepEqual(ch.rows[0], {
        provider: "valueor.web_widget",
        is_default: false,
        is_enabled: false,
        status: "pending",
        key: "web_chat",
      });

      await client.query(`update public.web_chat_widgets set enabled = true where id = $1`, [widgetA]);
      const activated = await client.query(`select is_enabled, status from public.company_channels where id = $1`, [channelId]);
      assert.deepEqual(activated.rows[0], { is_enabled: true, status: "active" });
      await client.query(`update public.web_chat_widgets set enabled = false where id = $1`, [widgetA]);
      const deactivated = await client.query(`select is_enabled, status from public.company_channels where id = $1`, [channelId]);
      assert.deepEqual(deactivated.rows[0], { is_enabled: false, status: "pending" });

      await expectError(
        () => client.query(`update public.company_channels set is_default = true where id = $1`, [channelId]),
        /cannot be the default/,
      );
      await expectError(
        () => client.query(`update public.company_channels set provider = 'generic.web_chat' where id = $1`, [channelId]),
        /provider is immutable/,
      );

      const generic = await client.query(
        `insert into public.company_channels (company_id, channel_id, display_name, provider, is_enabled, status)
         select $1, id, 'internal', 'generic.web_chat', true, 'active' from public.communication_channels where key = 'web_chat'
         returning id, is_enabled`,
        [CO_A],
      );
      assert.equal(generic.rows[0].is_enabled, true);
      await expectError(
        () => client.query(`update public.company_channels set provider = 'valueor.web_widget' where id = $1`, [generic.rows[0].id]),
        /provider is immutable/,
      );
    });
  });
});

describe("Phase 0 security — portal RPCs + public read (397)", () => {
  it("S6: public-read policy requires a non-suspended company", async () => {
    const policy = await client.query(
      `select qual from pg_policies
       where schemaname = 'public' and tablename = 'customer_portal_settings' and policyname = 'portal_settings_public_read'`,
    );
    assert.match(policy.rows[0].qual, /enabled = true/);
    assert.match(policy.rows[0].qual, /internal\.company_publicly_unlocked\(company_id\)/);

    await inTx(async () => {
      await asAnon(async () => {
        const { rows } = await client.query(
          `select internal.company_publicly_unlocked($1) as active,
                  internal.company_publicly_unlocked($2) as suspended,
                  internal.company_publicly_unlocked(null) as missing`,
          [CO_A, CO_SUSPENDED],
        );
        assert.deepEqual(rows[0], { active: true, suspended: false, missing: false });
      });
    });
  });

  it("S6 (pre-existing, unchanged): anon portal reads still fail on portal_settings_staff → current_company_id", async () => {
    await inTx(async () => {
      await asAnon(async () => {
        await expectError(
          () => client.query(`select 1 from public.customer_portal_settings limit 1`),
          /permission denied for function current_company_id/,
        );
      });
    });
  });

  it("S2: anon cannot execute portal_resolve_customer_by_phone; staff response has no owner id", async () => {
    await inTx(async () => {
      await asAnon(async () => {
        await expectError(
          () => client.query(`select public.portal_resolve_customer_by_phone($1, '+201000000000')`, [CO_A]),
          /permission denied/,
        );
      });
      await asUser(USER_A, async () => {
        const { rows } = await client.query(
          `select public.portal_resolve_customer_by_phone($1, '+209999999999') as r`,
          [CO_A],
        );
        assert.deepEqual(rows[0].r, { customer_id: null, exists: false });
        await expectError(
          () => client.query(`select public.portal_resolve_customer_by_phone($1, '+209999999999')`, [CO_B]),
          /Forbidden/,
        );
      });
    });
  });

  it("S1: anon upsert requires an enabled, non-suspended portal; cannot rewrite identity or borrow foreign owners", async () => {
    await inTx(async () => {
      const phone = `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      await client.query(`delete from public.customer_portal_settings where company_id = $1`, [CO_A]);

      await asAnon(async () => {
        await expectError(
          () =>
            client.query(`select public.portal_upsert_customer($1, 'Visitor', null, $2, null)`, [CO_A, phone]),
          /Portal unavailable/,
        );
      });

      await client.query(
        `insert into public.customer_portal_settings (company_id, slug, enabled) values ($1, $2, true)`,
        [CO_A, `wp-u-${randomBytes(4).toString("hex")}`],
      );

      const created = await asAnon(async () => {
        const { rows } = await client.query(
          `select public.portal_upsert_customer($1, 'Original Name', 'orig@example.test', $2, $3) as id`,
          [CO_A, phone, USER_B],
        );
        return rows[0].id;
      });
      const customer = await client.query(`select name, email, user_id, company_id from public.customers where id = $1`, [
        created,
      ]);
      assert.equal(customer.rows[0].company_id, CO_A);
      assert.notEqual(customer.rows[0].user_id, USER_B);

      await asAnon(async () => {
        const { rows } = await client.query(
          `select public.portal_upsert_customer($1, 'Attacker Name', 'attacker@example.test', $2, null) as id`,
          [CO_A, phone],
        );
        assert.equal(rows[0].id, created);
      });
      const afterAnon = await client.query(`select name, email from public.customers where id = $1`, [created]);
      assert.equal(afterAnon.rows[0].name, "Original Name");
      assert.equal(afterAnon.rows[0].email, "orig@example.test");

      await asUser(USER_A, async () => {
        await client.query(`select public.portal_upsert_customer($1, 'Staff Name', null, $2, null)`, [CO_A, phone]);
      });
      const afterStaff = await client.query(`select name from public.customers where id = $1`, [created]);
      assert.equal(afterStaff.rows[0].name, "Staff Name");

      await client.query(
        `insert into public.customer_portal_settings (company_id, slug, enabled) values ($1, $2, true)
         on conflict (company_id) do update set enabled = true`,
        [CO_SUSPENDED, `wp-su-${randomBytes(4).toString("hex")}`],
      );
      await asAnon(async () => {
        await expectError(
          () =>
            client.query(`select public.portal_upsert_customer($1, 'Visitor', null, $2, null)`, [CO_SUSPENDED, phone]),
          /Portal unavailable/,
        );
      });
    });
  });
});

describe("No anon access to Web Presence tables", () => {
  it("anon has no privileges on the new tables or provisioning RPC", async () => {
    await inTx(async () => {
      await asAnon(async () => {
        for (const table of ["web_presence_pages", "web_chat_widgets", "web_chat_visitor_sessions"]) {
          await expectError(() => client.query(`select 1 from public.${table} limit 1`), /permission denied/);
        }
        await expectError(
          () => client.query(`select public.web_presence_provision_widget($1, 'x')`, [CO_A]),
          /permission denied/,
        );
      });
    });
  });
});
});
