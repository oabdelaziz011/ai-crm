/**
 * Web Presence Phase 2 — Public Web Chat backend: live local DB verification (migration 400).
 *
 * LOCAL ONLY (127.0.0.1:54322). Scenarios run inside rolled-back transactions, except the
 * two-connection concurrency scenarios, which commit disposable fixtures and delete them.
 * Run: node --test scripts/web-chat-public-backend.test.mjs
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const LOCAL_DB_URL = process.env.WEB_PRESENCE_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(LOCAL_DB_URL)) {
  throw new Error("Refusing to run: public web chat test is local-only (127.0.0.1:54322).");
}

const CO_A = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const USER_A = "e6ee54a8-be96-4277-aede-319a3d049ee8";
const CO_B = "d0000010-0001-4001-8001-000000000002";
const USER_B = "d0000002-0001-4001-8001-000000000002";
const CO_SUSPENDED = "d0000010-0001-4001-8001-000000000001";
const ORIGIN = "https://shop.example.com";
const TEST_REASON = "public web chat phase 2 test";

const client = new pg.Client({ connectionString: LOCAL_DB_URL });

before(async () => {
  await client.connect();
});

after(async () => {
  await client.end();
});

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const newToken = () => `wct_${randomBytes(32).toString("base64url")}`;
const newVisitor = () => `wv_${randomBytes(16).toString("hex")}`;

async function inTx(fn) {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function expectError(promiseFactory, pattern, db = client) {
  await db.query("savepoint sp_expect");
  try {
    await promiseFactory();
  } catch (error) {
    await db.query("rollback to savepoint sp_expect");
    if (pattern) assert.match(String(error.message), pattern);
    return error;
  }
  await db.query("release savepoint sp_expect");
  assert.fail(`expected error${pattern ? ` matching ${pattern}` : ""}`);
}

async function asRole(role, fn, sub = null) {
  const claims = sub ? { sub, role } : { role };
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
  if (sub) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
  await client.query(`set local role ${role}`);
  const value = await fn();
  await client.query("reset role");
  await client.query(`select set_config('request.jwt.claims', '', true)`);
  await client.query(`select set_config('request.jwt.claim.role', '', true)`);
  await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return value;
}

async function entitle(companyId, state = "enabled", db = client) {
  const { rows } = await db.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     values ($1, 'web_chat_widget', $2, 'manual', true, $3) returning id`,
    [companyId, state, TEST_REASON],
  );
  return rows[0].id;
}

async function createWidget(companyId, { enabled = true, origins = [ORIGIN], employeeId = null, db = client } = {}) {
  const channel = await db.query(
    `insert into public.company_channels (company_id, channel_id, display_name, provider)
     select $1, id, 'Website chat (test)', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
     returning id`,
    [companyId],
  );
  const widget = await db.query(
    `insert into public.web_chat_widgets (company_id, company_channel_id, name, enabled, allowed_origins, ai_employee_id, greeting)
     values ($1, $2, 'Test site', $3, $4, $5, 'Hello!') returning id, public_key`,
    [companyId, channel.rows[0].id, enabled, origins, employeeId],
  );
  return { widgetId: widget.rows[0].id, publicKey: widget.rows[0].public_key, channelId: channel.rows[0].id };
}

async function createEmployee(companyId, { status = "published", deleted = false } = {}) {
  const employee = await client.query(
    `insert into public.ai_employees (company_id, name, display_name) values ($1, $2, 'Web Agent') returning id`,
    [companyId, `wc-${randomBytes(4).toString("hex")}`],
  );
  const id = employee.rows[0].id;
  const version = await client.query(
    `insert into public.ai_employee_versions (company_id, employee_id, version_number, snapshot)
     values ($1, $2, 1, '{}'::jsonb) returning id`,
    [companyId, id],
  );
  await client.query(`update public.ai_employees set status = 'published', published_version_id = $2 where id = $1`, [
    id,
    version.rows[0].id,
  ]);
  return {
    id,
    finalize: async () => {
      if (status !== "published") await client.query(`update public.ai_employees set status = $2 where id = $1`, [id, status]);
      if (deleted) await client.query(`update public.ai_employees set deleted_at = now() where id = $1`, [id]);
    },
  };
}

async function resolveWidget(publicKey, db = client) {
  const { rows } = await db.query(`select * from public.web_chat_public_resolve_widget($1)`, [publicKey]);
  return rows[0] ?? null;
}

async function createSession(widgetId, { token = newToken(), ipHash = sha256("ip-1"), maxPerIp = 5, db = client } = {}) {
  const { rows } = await db.query(
    `select public.web_chat_public_create_session($1, $2, $3, $4, $5, 86400, $6) as id`,
    [widgetId, sha256(token), newVisitor(), ipHash, sha256("ua"), maxPerIp],
  );
  return { sessionId: rows[0].id, token };
}

async function authorize(sessionId, token) {
  const { rows } = await client.query(`select * from public.web_chat_public_authorize_session($1, $2)`, [
    sessionId,
    sha256(token),
  ]);
  return rows[0] ?? null;
}

async function ensureConversation(sessionId, db = client) {
  const { rows } = await db.query(`select * from public.web_chat_public_ensure_conversation($1)`, [sessionId]);
  return rows[0];
}

async function claim(sessionId, clientMessageId, db = client) {
  const { rows } = await db.query(`select * from public.web_chat_public_claim_message($1, $2)`, [
    sessionId,
    clientMessageId,
  ]);
  return rows[0];
}

async function listMessages(sessionId, afterSeq = 0, limit = 50) {
  const { rows } = await client.query(`select * from public.web_chat_public_list_messages($1, $2, $3)`, [
    sessionId,
    afterSeq,
    limit,
  ]);
  return rows;
}

async function insertMessage(conversationId, fields) {
  const { rows } = await client.query(
    `insert into public.conversation_messages
       (conversation_id, message_type, content_type, content, status, metadata, created_by, external_message_id)
     values ($1, $2, coalesce($3, 'text'), $4, coalesce($5, 'sent'), coalesce($6::jsonb, '{}'::jsonb), $7, $8)
     returning id, sequence_number`,
    [
      conversationId,
      fields.type,
      fields.contentType ?? null,
      fields.content,
      fields.status ?? null,
      fields.metadata ? JSON.stringify(fields.metadata) : null,
      fields.createdBy ?? null,
      fields.externalMessageId ?? null,
    ],
  );
  return rows[0];
}

describe("Phase 2 — widget resolution + availability", () => {
  it("1. enabled + entitled widget resolves; channel activation follows widget.enabled", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const resolved = await resolveWidget(w.publicKey);
      assert.equal(resolved.widget_id, w.widgetId);
      assert.equal(resolved.company_id, CO_B);
      assert.equal(resolved.company_channel_id, w.channelId);
      assert.deepEqual(resolved.allowed_origins, [ORIGIN]);
      const channel = await client.query(`select is_enabled, status, is_default from public.company_channels where id = $1`, [
        w.channelId,
      ]);
      assert.deepEqual(channel.rows[0], { is_enabled: true, status: "active", is_default: false });

      await client.query(`update public.web_chat_widgets set enabled = false where id = $1`, [w.widgetId]);
      const disabled = await client.query(`select is_enabled, status from public.company_channels where id = $1`, [w.channelId]);
      assert.deepEqual(disabled.rows[0], { is_enabled: false, status: "pending" });
    });
  });

  it("2. invalid / unknown / company-id keys resolve to nothing", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      await createWidget(CO_B);
      for (const key of ["", "wcw_x", `wcw_${"0".repeat(48)}`, CO_B, "' or 1=1 --"]) {
        assert.equal(await resolveWidget(key), null, key);
      }
    });
  });

  it("3. disabled widget: no resolution, no session", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B, { enabled: false });
      assert.equal(await resolveWidget(w.publicKey), null);
      await expectError(() => createSession(w.widgetId), /web_chat_unavailable/);
    });
  });

  it("4. entitlement disabled: no resolution, no session", async () => {
    await inTx(async () => {
      await entitle(CO_B, "disabled");
      const w = await createWidget(CO_B);
      assert.equal(await resolveWidget(w.publicKey), null);
      await expectError(() => createSession(w.widgetId), /web_chat_unavailable/);
    });
  });

  it("5. suspended company: no resolution even with entitlement + enabled widget", async () => {
    await inTx(async () => {
      await entitle(CO_SUSPENDED);
      const w = await createWidget(CO_SUSPENDED);
      assert.equal(await resolveWidget(w.publicKey), null);
      await expectError(() => createSession(w.widgetId), /web_chat_unavailable/);
    });
  });
});

describe("Phase 2 — visitor sessions", () => {
  it("8. only the SHA-256 token hash is stored; raw token never authorizes", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId, token } = await createSession(w.widgetId);
      const row = (await client.query(`select * from public.web_chat_visitor_sessions where id = $1`, [sessionId])).rows[0];
      assert.equal(row.token_hash, sha256(token));
      assert.ok(!Object.values(row).some((v) => typeof v === "string" && v.includes(token)));
      assert.ok((await authorize(sessionId, token))?.available);
      const raw = await client.query(`select * from public.web_chat_public_authorize_session($1, $2)`, [sessionId, token]);
      assert.equal(raw.rows.length, 0);
      const resumed = await client.query(`select * from public.web_chat_public_resume_session($1, $2)`, [
        w.widgetId,
        sha256(token),
      ]);
      assert.equal(resumed.rows[0].session_id, sessionId);
    });
  });

  it("9 / 34. expired session: no authorize, resume, preflight origins or conversation", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId, token } = await createSession(w.widgetId);
      await client.query(
        `update public.web_chat_visitor_sessions
         set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
         where id = $1`,
        [sessionId],
      );
      assert.equal(await authorize(sessionId, token), null);
      const resumed = await client.query(`select * from public.web_chat_public_resume_session($1, $2)`, [
        w.widgetId,
        sha256(token),
      ]);
      assert.equal(resumed.rows.length, 0);
      const origins = await client.query(`select public.web_chat_public_session_allowed_origins($1) as o`, [sessionId]);
      assert.deepEqual(origins.rows[0].o, []);
      await expectError(() => ensureConversation(sessionId), /web_chat_unavailable/);
    });
  });

  it("10. blocked session: rejected everywhere", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId, token } = await createSession(w.widgetId);
      await client.query(`update public.web_chat_visitor_sessions set blocked = true where id = $1`, [sessionId]);
      assert.equal(await authorize(sessionId, token), null);
      await expectError(() => ensureConversation(sessionId), /web_chat_unavailable/);
    });
  });

  it("11. cross-company: a session token never resumes on another company's widget", async () => {
    await inTx(async () => {
      await entitle(CO_A);
      await entitle(CO_B);
      const wA = await createWidget(CO_A);
      const wB = await createWidget(CO_B);
      const sB = await createSession(wB.widgetId);
      const onA = await client.query(`select * from public.web_chat_public_resume_session($1, $2)`, [
        wA.widgetId,
        sha256(sB.token),
      ]);
      assert.equal(onA.rows.length, 0);
      const auth = await authorize(sB.sessionId, sB.token);
      assert.equal(auth.company_id, CO_B);
      assert.equal(auth.widget_id, wB.widgetId);
    });
  });

  it("18b. max active sessions per widget + IP is enforced", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      await createSession(w.widgetId, { maxPerIp: 2 });
      await createSession(w.widgetId, { maxPerIp: 2 });
      await expectError(() => createSession(w.widgetId, { maxPerIp: 2 }), /web_chat_session_limit/);
      await createSession(w.widgetId, { maxPerIp: 2, ipHash: sha256("ip-2") });
    });
  });

  it("33. feature disabled after the session exists → not available, no conversation", async () => {
    await inTx(async () => {
      const override = await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId, token } = await createSession(w.widgetId);
      await client.query(`update public.company_feature_overrides set override_state = 'disabled' where id = $1`, [override]);
      const auth = await authorize(sessionId, token);
      assert.equal(auth.available, false);
      const origins = await client.query(`select public.web_chat_public_session_allowed_origins($1) as o`, [sessionId]);
      assert.deepEqual(origins.rows[0].o, []);
      await expectError(() => ensureConversation(sessionId), /web_chat_unavailable/);
    });
  });
});

describe("Phase 2 — conversations + AI Employee", () => {
  it("4 / 21–23. conversation on the widget channel; anonymous; no lead or customer created", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      const counts = async () =>
        (
          await client.query(
            `select (select count(*) from public.leads where company_id = $1)::int as leads,
                    (select count(*) from public.customers where company_id = $1)::int as customers`,
            [CO_B],
          )
        ).rows[0];
      const beforeCounts = await counts();

      const binding = await ensureConversation(sessionId);
      const again = await ensureConversation(sessionId);
      assert.equal(again.conversation_id, binding.conversation_id);
      assert.equal(again.channel_session_id, binding.channel_session_id);
      assert.equal(binding.external_thread_id, `webchat:${sessionId}`);

      const conversation = (
        await client.query(`select * from public.conversations where id = $1`, [binding.conversation_id])
      ).rows[0];
      assert.equal(conversation.company_id, CO_B);
      assert.equal(conversation.channel_type, "web_chat");
      assert.equal(conversation.company_channel_id, w.channelId);
      assert.equal(conversation.customer_id ?? null, null);
      assert.equal(conversation.lead_id ?? null, null);
      assert.equal(conversation.metadata.publicWebChat, true);
      assert.equal(conversation.metadata.channelProvider, "valueor.web_widget");
      assert.equal(conversation.metadata.channelIdentityStatus, "anonymous_visitor");
      assert.equal(conversation.metadata.trustedChannelCustomerId, null);
      assert.equal(conversation.metadata.aiEmployeeId, undefined);

      await insertMessage(binding.conversation_id, { type: "incoming", content: "hello", status: "delivered" });
      assert.deepEqual(await counts(), beforeCounts);

      const sessions = await client.query(
        `select count(*)::int as n from public.channel_sessions where company_channel_id = $1`,
        [w.channelId],
      );
      assert.equal(sessions.rows[0].n, 1);
    });
  });

  it("26. only the widget's own published employee is bound to the conversation", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const employee = await createEmployee(CO_B);
      const w = await createWidget(CO_B, { employeeId: employee.id });
      assert.equal((await resolveWidget(w.publicKey)).ai_employee_id, employee.id);
      const { sessionId, token } = await createSession(w.widgetId);
      assert.equal((await authorize(sessionId, token)).ai_employee_id, employee.id);
      const binding = await ensureConversation(sessionId);
      const conversation = (
        await client.query(`select metadata from public.conversations where id = $1`, [binding.conversation_id])
      ).rows[0];
      assert.equal(conversation.metadata.aiEmployeeId, employee.id);
      assert.equal(conversation.metadata.aiEmployeeInboundSession, true);
    });
  });

  for (const [label, options] of [
    ["27. archived", { status: "archived" }],
    ["27b. disabled", { status: "disabled" }],
    ["27c. draft", { status: "draft" }],
    ["28. deleted", { deleted: true }],
  ]) {
    it(`${label} employee is never used (no fallback to another employee)`, async () => {
      await inTx(async () => {
        await entitle(CO_B);
        const other = await createEmployee(CO_B);
        const employee = await createEmployee(CO_B, options);
        const w = await createWidget(CO_B, { employeeId: employee.id });
        await employee.finalize();
        assert.equal((await resolveWidget(w.publicKey)).ai_employee_id, null);
        const { sessionId, token } = await createSession(w.widgetId);
        assert.equal((await authorize(sessionId, token)).ai_employee_id, null);
        const binding = await ensureConversation(sessionId);
        const metadata = (
          await client.query(`select metadata from public.conversations where id = $1`, [binding.conversation_id])
        ).rows[0].metadata;
        assert.equal(metadata.aiEmployeeId, undefined);
        assert.notEqual(metadata.aiEmployeeId, other.id);
      });
    });
  }

  it("27d. another company's employee cannot be bound to the widget", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const foreign = await createEmployee(CO_A);
      await expectError(() => createWidget(CO_B, { employeeId: foreign.id }), /AI Employee must belong to the same company/);
    });
  });
});

describe("Phase 2 — messages", () => {
  it("16. duplicate client_message_id is claimed once; failed claims are retryable", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      const first = await claim(sessionId, "msg-00000001");
      assert.equal(first.claimed, true);
      const dup = await claim(sessionId, "msg-00000001");
      assert.equal(dup.claimed, false);
      assert.equal(dup.status, "processing");

      await client.query(`select public.web_chat_public_complete_message($1, 'failed', 'not_persisted', null)`, [
        first.submission_id,
      ]);
      const retry = await claim(sessionId, "msg-00000001");
      assert.equal(retry.claimed, true);
      assert.equal(retry.submission_id, first.submission_id);

      await client.query(`select public.web_chat_public_complete_message($1, 'completed', 'replied', null)`, [
        first.submission_id,
      ]);
      const done = await claim(sessionId, "msg-00000001");
      assert.deepEqual([done.claimed, done.status, done.outcome], [false, "completed", "replied"]);
      await expectError(() => claim(sessionId, "bad id"), /web_chat_message_submissions_client_id_format/);
    });
  });

  it("19 / 11. visitor read: safe fields only, ordered, internal notes / system / tools / failed excluded", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      const { conversation_id: conversationId } = await ensureConversation(sessionId);

      await insertMessage(conversationId, { type: "incoming", content: "Hi there", status: "delivered" });
      await insertMessage(conversationId, {
        type: "outgoing",
        content: "Hello from AI",
        metadata: { runtimeExecutionId: "run-1", toolCalls: [{ name: "search_customers" }] },
        createdBy: USER_B,
      });
      await insertMessage(conversationId, { type: "internal_note", content: "VIP — check invoice #123", createdBy: USER_B });
      await insertMessage(conversationId, { type: "system", contentType: "system", content: "Handoff requested" });
      await insertMessage(conversationId, { type: "outgoing", contentType: "tool_result", content: '{"customer":"x"}' });
      await insertMessage(conversationId, { type: "outgoing", content: "failed send", status: "failed", createdBy: USER_B });
      await insertMessage(conversationId, { type: "outgoing", content: "Staff reply", createdBy: USER_B });
      await client.query(`select public.web_chat_public_record_fallback($1, 'msg-00000009', 'Fallback text')`, [sessionId]);

      const rows = await listMessages(sessionId);
      assert.deepEqual(
        rows.map((r) => [r.sender, r.content]),
        [
          ["visitor", "Hi there"],
          ["assistant", "Hello from AI"],
          ["agent", "Staff reply"],
          ["assistant", "Fallback text"],
        ],
      );
      const sequences = rows.map((r) => Number(r.sequence));
      assert.deepEqual([...sequences].sort((a, b) => a - b), sequences);
      assert.deepEqual(Object.keys(rows[0]).sort(), ["content", "created_at", "message_id", "sender", "sequence"]);

      const afterSecond = await listMessages(sessionId, sequences[1]);
      assert.deepEqual(afterSecond.map((r) => r.content), ["Staff reply", "Fallback text"]);
      assert.equal((await listMessages(sessionId, 0, 1)).length, 1);
    });
  });

  it("30. AI-failure fallback message is persisted idempotently", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      await ensureConversation(sessionId);
      const a = await client.query(`select public.web_chat_public_record_fallback($1, 'msg-00000001', 'Sorry') as id`, [sessionId]);
      const b = await client.query(`select public.web_chat_public_record_fallback($1, 'msg-00000001', 'Sorry') as id`, [sessionId]);
      assert.equal(a.rows[0].id, b.rows[0].id);
      assert.equal((await listMessages(sessionId)).length, 1);
    });
  });

  it("20. cross-conversation read blocked: each session only sees its own conversation", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const s1 = await createSession(w.widgetId);
      const s2 = await createSession(w.widgetId, { ipHash: sha256("ip-2") });
      const c1 = await ensureConversation(s1.sessionId);
      const c2 = await ensureConversation(s2.sessionId);
      assert.notEqual(c1.conversation_id, c2.conversation_id);
      await insertMessage(c2.conversation_id, { type: "incoming", content: "secret of visitor 2", status: "delivered" });
      assert.deepEqual(await listMessages(s1.sessionId), []);
      assert.equal((await listMessages(s2.sessionId)).length, 1);
    });
  });

  it("39. internal AI chat (generic.web_chat) conversations are never reachable through the public read", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      const generic = await client.query(
        `select cc.id from public.company_channels cc where cc.company_id = $1 and cc.provider = 'generic.web_chat' limit 1`,
        [CO_B],
      );
      const assistant = await client.query(`select id from public.ai_assistant_settings where company_id = $1 limit 1`, [CO_B]);
      const internal = await client.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, company_channel_id)
         values ($1, $2, 'web_chat', $3) returning id`,
        [CO_B, assistant.rows[0].id, generic.rows[0]?.id ?? null],
      );
      await insertMessage(internal.rows[0].id, { type: "incoming", content: "internal staff AI chat", status: "delivered" });
      await expectError(
        () =>
          client.query(`update public.web_chat_visitor_sessions set conversation_id = $2 where id = $1`, [
            sessionId,
            internal.rows[0].id,
          ]),
        /Visitor session conversation must use the widget channel/,
      );

      await client.query("set local session_replication_role = replica");
      await client.query(`update public.web_chat_visitor_sessions set conversation_id = $2 where id = $1`, [
        sessionId,
        internal.rows[0].id,
      ]);
      await client.query("set local session_replication_role = origin");
      assert.deepEqual(await listMessages(sessionId), []);
    });
  });
});

describe("Phase 2 — grants + staff RLS", () => {
  const RPC_CALLS = [
    [`select * from public.web_chat_public_resolve_widget('wcw_x')`, []],
    [`select public.web_chat_public_create_session(gen_random_uuid(), 'x', 'v', null, null, 60, 1)`, []],
    [`select * from public.web_chat_public_authorize_session(gen_random_uuid(), 'x')`, []],
    [`select * from public.web_chat_public_ensure_conversation(gen_random_uuid())`, []],
    [`select * from public.web_chat_public_claim_message(gen_random_uuid(), 'msg-00000001')`, []],
    [`select * from public.web_chat_public_list_messages(gen_random_uuid(), 0, 10)`, []],
    [`select public.web_chat_public_record_fallback(gen_random_uuid(), 'msg-00000001', 'x')`, []],
  ];

  it("anon and authenticated cannot execute any public web chat RPC", async () => {
    await inTx(async () => {
      for (const role of ["anon", "authenticated"]) {
        await asRole(
          role,
          async () => {
            for (const [sql] of RPC_CALLS) {
              await expectError(() => client.query(sql), /permission denied/);
            }
            if (role === "anon") {
              await expectError(() => client.query(`select 1 from public.web_chat_message_submissions limit 1`), /permission denied/);
            }
          },
          role === "authenticated" ? USER_A : null,
        );
      }
    });
  });

  it("service_role can execute (resolution works end-to-end under the api-server role)", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      const w = await createWidget(CO_B);
      const resolved = await asRole("service_role", () => resolveWidget(w.publicKey));
      assert.equal(resolved.widget_id, w.widgetId);
      const session = await asRole("service_role", () => createSession(w.widgetId));
      const binding = await asRole("service_role", () => ensureConversation(session.sessionId));
      assert.ok(binding.conversation_id);
    });
  });

  it("staff read submissions only for their own company (and only with feature + RBAC)", async () => {
    await inTx(async () => {
      await entitle(CO_B);
      await client.query(
        `insert into public.user_permissions (user_id, permission_id)
         select $1, id from public.permissions where code = 'web_presence.view' on conflict do nothing`,
        [USER_B],
      );
      const w = await createWidget(CO_B);
      const { sessionId } = await createSession(w.widgetId);
      await claim(sessionId, "msg-00000001");
      const ownRows = await asRole("authenticated", async () => (await client.query(`select id from public.web_chat_message_submissions`)).rows, USER_B);
      assert.equal(ownRows.length, 1);
      const otherRows = await asRole("authenticated", async () => (await client.query(`select id from public.web_chat_message_submissions`)).rows, USER_A);
      assert.equal(otherRows.length, 0);
      await asRole(
        "authenticated",
        async () => {
          await expectError(
            () => client.query(`update public.web_chat_message_submissions set status = 'failed'`),
            /permission denied/,
          );
        },
        USER_B,
      );
    });
  });
});

describe("Phase 2 — concurrency (two connections, committed disposable fixtures)", () => {
  it("17 / 18. concurrent first message: one conversation, one channel session, one claim", async () => {
    const c1 = new pg.Client({ connectionString: LOCAL_DB_URL });
    const c2 = new pg.Client({ connectionString: LOCAL_DB_URL });
    await c1.connect();
    await c2.connect();
    let fixture = null;
    try {
      const overrideId = await entitle(CO_B, "enabled", c1);
      const w = await createWidget(CO_B, { db: c1 });
      const { sessionId } = await createSession(w.widgetId, { db: c1, ipHash: sha256(`ip-${randomBytes(4).toString("hex")}`) });
      fixture = { overrideId, ...w, sessionId };

      await c1.query("begin");
      await c2.query("begin");
      const first = await ensureConversation(sessionId, c1);
      const secondPromise = ensureConversation(sessionId, c2);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await c1.query("commit");
      const second = await secondPromise;
      await c2.query("commit");
      assert.equal(second.conversation_id, first.conversation_id);

      const [a, b] = await Promise.all([claim(sessionId, "msg-concurrent-1", c1), claim(sessionId, "msg-concurrent-1", c2)]);
      assert.deepEqual([a.claimed, b.claimed].sort(), [false, true]);

      const counts = await client.query(
        `select (select count(*) from public.conversations where company_channel_id = $1)::int as conversations,
                (select count(*) from public.channel_sessions where company_channel_id = $1)::int as sessions,
                (select count(*) from public.web_chat_message_submissions where session_id = $2)::int as submissions`,
        [w.channelId, sessionId],
      );
      assert.deepEqual(counts.rows[0], { conversations: 1, sessions: 1, submissions: 1 });
    } finally {
      await c1.query("rollback").catch(() => {});
      await c2.query("rollback").catch(() => {});
      if (fixture) {
        await client.query("begin");
        await client.query("set local session_replication_role = replica");
        await client.query(`delete from public.web_chat_message_submissions where session_id = $1`, [fixture.sessionId]);
        await client.query(`delete from public.channel_sessions where company_channel_id = $1`, [fixture.channelId]);
        await client.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [fixture.widgetId]);
        await client.query(
          `delete from public.conversation_messages where conversation_id in (select id from public.conversations where company_channel_id = $1)`,
          [fixture.channelId],
        );
        await client.query(`delete from public.conversations where company_channel_id = $1`, [fixture.channelId]);
        await client.query(`delete from public.web_chat_widgets where id = $1`, [fixture.widgetId]);
        await client.query(`delete from public.company_channels where id = $1`, [fixture.channelId]);
        await client.query(`delete from public.company_feature_overrides where id = $1`, [fixture.overrideId]);
        await client.query("commit");
      }
      await c1.end();
      await c2.end();
    }
  });
});
