import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyWorkspaceHref, companyWorkspaceNestPath } from "./company-workspace-routes";

describe("companyWorkspaceHref employee deep link", () => {
  it("includes employee query param and forces employees tab", () => {
    const nest = companyWorkspaceNestPath("overview", { employeeId: "emp-123" });
    assert.match(nest, /tab=employees/);
    assert.match(nest, /employee=emp-123/);

    const href = companyWorkspaceHref("overview", { employeeId: "emp-123" });
    assert.match(href, /employee=emp-123/);
    assert.match(href, /tab=employees/);
  });
});
