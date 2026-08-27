import assert from "node:assert/strict";
import { filterPermissionsForCompanyEntitlements } from "../src/lib/companies/company-review-permission-filter.ts";

const permissions = [
  { id: "1", code: "customers.view", category: null, module: null, action: null, description: null },
  { id: "2", code: "leads.view", category: null, module: null, action: null, description: null },
  { id: "3", code: "settings.view", category: null, module: null, action: null, description: null },
];

const entitlements = [
  { feature_code: "customers", enabled: true, label: "Customers", source: "package", is_commercial: true },
  { feature_code: "leads", enabled: false, label: "Leads", source: "package", is_commercial: true },
];

const map = new Map<string, readonly string[]>([
  ["customers", ["customers.view"]],
  ["leads", ["leads.view"]],
]);

const filtered = filterPermissionsForCompanyEntitlements(permissions, entitlements, map);
assert.deepEqual(
  filtered.map((row) => row.code),
  ["customers.view", "settings.view"],
  "maps enabled features and keeps unmapped permissions",
);

console.log("PASS company-review-permission-filter.test.mts");
