import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpError } from "../middleware/error-handler.js";
import { updateOwnedCustomer } from "./mobile-customer-update.js";

function client(found: boolean) {
  const calls: string[] = [];
  return {
    calls,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        update() {
          calls.push("update");
          return this;
        },
        maybeSingle: async () => ({ data: found ? { id: "row" } : null, error: null }),
        then(onfulfilled: (value: { data: { id: string }[] | null; error: null }) => unknown) {
          return Promise.resolve(onfulfilled({ data: found ? [{ id: "row" }] : [], error: null }));
        },
      };
    },
  };
}

describe("owned customer update", () => {
  it("does not report success for a record outside the tenant", async () => {
    const database = client(false);
    await assert.rejects(
      () => updateOwnedCustomer(database as never, { companyId: "alpha", id: "gamma-customer", name: "Changed", phone: null }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404 && error.code === "not_found",
    );
    assert.deepEqual(database.calls, []);
  });

  it("updates a record that belongs to the tenant", async () => {
    const database = client(true);
    await updateOwnedCustomer(database as never, { companyId: "gamma", id: "customer", name: "Updated", phone: null });
    assert.deepEqual(database.calls, ["update"]);
  });
});
