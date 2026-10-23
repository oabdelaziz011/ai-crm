import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const seedSql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/427_ai_employee_quote_delivery_tools.sql"),
  "utf8",
);

describe("migration 427 quote delivery tool seed guard", () => {
  it("registers request_send_quote with tools.execute + quotes.edit only", () => {
    assert.match(seedSql, /'request_send_quote'/);
    assert.match(seedSql, /\["tools\.execute","quotes\.edit"\]/);
    assert.doesNotMatch(seedSql, /'request_send_quote'[\s\S]{0,800}"quotes\.send"/);
  });

  it("registers get_quote_delivery_status as quotes.view read path", () => {
    assert.match(seedSql, /'get_quote_delivery_status'/);
    assert.match(seedSql, /\["tools\.execute","quotes\.view"\]/);
  });

  it("does not widen create_draft_quote to send/approve/delete", () => {
    assert.match(seedSql, /create_draft_quote must not include send\/approve\/delete/);
    assert.match(seedSql, /@> '\["quotes\.send"\]'/);
  });
});
