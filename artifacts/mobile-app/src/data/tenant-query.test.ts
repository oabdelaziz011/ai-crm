import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listCompanyRows, requireCompanyId, type TenantQuery } from "./tenant-query";

function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: TenantQuery = {
    select(columns) {
      calls.push({ method: "select", args: [columns] });
      return query;
    },
    eq(column, value) {
      calls.push({ method: "eq", args: [column, value] });
      return query;
    },
    ilike(column, pattern) {
      calls.push({ method: "ilike", args: [column, pattern] });
      return query;
    },
    is() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    },
  };
  return {
    calls,
    client: { from: () => query },
  };
}

describe("tenant queries", () => {
  it("always scopes rows to the server company and rejects a missing company", () => {
    assert.throws(() => requireCompanyId(null), /tenant_required/);
    const fake = fakeClient();
    listCompanyRows(fake.client, {
      table: "customers",
      companyId: "company-1",
      columns: "id,name",
      searchColumn: "name",
      search: "Ada",
    });
    assert.deepEqual(fake.calls.find((call) => call.method === "eq")?.args, ["company_id", "company-1"]);
    assert.equal(fake.calls.some((call) => call.args[0] === "company-2"), false);
  });
});
