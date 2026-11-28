import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNumberedPageWindow,
  normalizeSalesOrdersPageSize,
} from "./sales-order-types.js";
import { normalizeSalesOrdersFilters } from "./sales-orders-query.js";

describe("sales orders filters and pagination helpers", () => {
  it("normalizes filters with safe defaults", () => {
    const filters = normalizeSalesOrdersFilters({
      search: "  SO-1  ",
      status: "pending_approval",
      paymentMethod: "cash_on_delivery",
      page: 0,
      pageSize: 99 as never,
    });
    assert.equal(filters.search, "SO-1");
    assert.equal(filters.status, "pending_approval");
    assert.equal(filters.paymentMethod, "cash_on_delivery");
    assert.equal(filters.page, 1);
    assert.equal(filters.pageSize, 25);
  });

  it("rejects unknown status/payment into all", () => {
    const filters = normalizeSalesOrdersFilters({
      status: "bogus" as never,
      paymentMethod: "card" as never,
    });
    assert.equal(filters.status, "all");
    assert.equal(filters.paymentMethod, "all");
  });

  it("keeps only allowed page sizes", () => {
    assert.equal(normalizeSalesOrdersPageSize(10), 10);
    assert.equal(normalizeSalesOrdersPageSize(25), 25);
    assert.equal(normalizeSalesOrdersPageSize(50), 50);
    assert.equal(normalizeSalesOrdersPageSize(12), 25);
  });

  it("builds numbered page windows with ellipsis", () => {
    assert.deepEqual(buildNumberedPageWindow(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(buildNumberedPageWindow(1, 10), [1, 2, 3, "ellipsis", 10]);
    assert.deepEqual(buildNumberedPageWindow(5, 10), [1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 10]);
    assert.deepEqual(buildNumberedPageWindow(10, 10), [1, "ellipsis", 8, 9, 10]);
  });
});
