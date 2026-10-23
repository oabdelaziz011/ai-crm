import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const seedSql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/426_ai_employee_create_draft_quote_tool.sql"),
  "utf8",
);

describe("migration 426 create_draft_quote seed guard", () => {
  it("registers only create_draft_quote with tools.execute and quotes.create", () => {
    assert.match(seedSql, /insert into public\.tool_definitions/i);
    assert.match(seedSql, /'create_draft_quote'/);
    assert.match(seedSql, /\["tools\.execute","quotes\.create"\]/);
    assert.match(seedSql, /on conflict \(key\) do update/i);
    assert.match(seedSql, /'sales'/);
  });

  it("does not grant send, approve, delete, edit, or view via required_permissions", () => {
    const permissionJson = seedSql.match(/'\["tools\.execute","quotes\.create"\]'/);
    assert.ok(permissionJson, "exact tools.execute + quotes.create jsonb literal");
    const allQuotePermCodes = seedSql.match(/"quotes\.[a-z_]+"/g) ?? [];
    assert.deepEqual(allQuotePermCodes, ['"quotes.create"']);
    for (const banned of [
      '"quotes.send"',
      '"quotes.approve"',
      '"quotes.delete"',
      '"quotes.edit"',
      '"quotes.view"',
    ]) {
      assert.equal(seedSql.includes(banned), false, banned);
    }
  });

  it("does not create tables or touch catalog/quote data tables", () => {
    assert.equal(/create table/i.test(seedSql), false);
    assert.equal(seedSql.includes("catalog_products"), false);
    assert.equal(/from public\.quotes\b/i.test(seedSql), false);
    assert.equal(/into public\.quotes\b/i.test(seedSql), false);
  });
});


