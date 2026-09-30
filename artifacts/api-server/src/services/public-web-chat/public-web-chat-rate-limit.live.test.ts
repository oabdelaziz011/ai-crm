/**
 * Phase 2.3 — shared Postgres rate-limit consume (live local DB).
 * Run from artifacts/api-server: npx tsx --test src/services/public-web-chat/public-web-chat-rate-limit.live.test.ts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "../../../../../lib/db/node_modules/pg/lib/index.js";

const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const db = new pg.Client({ connectionString: LOCAL_DB_URL });

async function consume(key: string, limit = 10, windowMs = 60_000) {
  const row = await db.query(`select public.web_chat_rate_limit_consume($1, $2, $3) as d`, [key, limit, windowMs]);
  return row.rows[0].d as { allowed: boolean; retry_after_seconds: number; count: number };
}

describe("Phase 2.3 shared web_chat_rate_limit_consume (live local)", () => {
  before(async () => {
    await db.connect();
  });
  after(async () => {
    await db.end();
  });

  it("enforces the limit and shares state across connections", async () => {
    const key = `p23-share-${Date.now()}`;
    const other = new pg.Client({ connectionString: LOCAL_DB_URL });
    await other.connect();
    try {
      const a = await consume(key, 2);
      const b = await other.query(`select public.web_chat_rate_limit_consume($1, 2, 60000) as d`, [key]);
      const c = await consume(key, 2);
      assert.equal(a.allowed, true);
      assert.equal(b.rows[0].d.allowed, true);
      assert.equal(c.allowed, false);
    } finally {
      await other.end();
    }
  });

  it("serializes concurrent consumes on one key (advisory lock)", async () => {
    const key = `p23-race-${Date.now()}`;
    const clients = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const extra = new pg.Client({ connectionString: LOCAL_DB_URL });
        await extra.connect();
        return extra;
      }),
    );
    try {
      const results = await Promise.all(
        clients.map((extra) => extra.query(`select public.web_chat_rate_limit_consume($1, 8, 60000) as d`, [key])),
      );
      const allowed = results.filter((row) => row.rows[0].d.allowed).length;
      assert.equal(allowed, 8);
      assert.equal(results.length - allowed, 12);
    } finally {
      await Promise.all(clients.map((extra) => extra.end()));
    }
  });
});
