import assert from "node:assert/strict";
import { validateManifest, parseManifest } from "../src/lib/plugins/manifest/manifest-validator.ts";
import { hasPluginPermission, resolveEffectivePermissions } from "../src/lib/plugins/permissions/permission-resolver.ts";
import { buildDependencyGraph, validateDependencies, detectCycles, topologicalSort } from "../src/lib/plugins/registry/dependency-graph.ts";
import { EXTENSION_POINTS, isValidExtensionPoint } from "../src/lib/plugins/registry/plugin-registry.ts";
import { pluginSandbox } from "../src/lib/plugins/sandbox/plugin-sandbox.ts";
import { createPluginScaffold, validatePluginManifest } from "../src/lib/plugins/sdk/plugin-sdk.ts";
import type { PluginManifest, PluginPermission } from "../src/lib/plugins/types/plugin-types.ts";

const sampleManifest: PluginManifest = {
  pluginId: "acme.sample",
  name: "Sample Plugin",
  author: "Acme",
  version: "1.0.0",
  category: "general",
  permissions: ["customers.read", "bookings.read"],
  minPlatformVersion: "7.0.0",
  dependencies: [],
  entryPoints: { main: "index.js" },
  hooks: ["widget"],
};

{
  const result = validateManifest(sampleManifest);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
}

{
  const invalid = validateManifest({ pluginId: "BAD ID", version: "bad" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);
}

{
  const granted: PluginPermission[] = ["customers.read", "bookings.write"];
  assert.equal(hasPluginPermission(granted, "customers.read"), true);
  assert.equal(hasPluginPermission(granted, "bookings.read"), true);
  assert.equal(hasPluginPermission(granted, "billing.read"), false);
}

{
  const { granted, denied } = resolveEffectivePermissions(
    ["customers.read", "billing.read"],
    ["customers.read"],
  );
  assert.deepEqual(granted, ["customers.read"]);
  assert.deepEqual(denied, ["billing.read"]);
}

{
  const a: PluginManifest = { ...sampleManifest, pluginId: "a", dependencies: ["b"] };
  const b: PluginManifest = { ...sampleManifest, pluginId: "b", dependencies: [] };
  const graph = buildDependencyGraph([a, b]);
  assert.equal(graph.length, 2);
  const dep = validateDependencies("a", ["b"], new Set(["b"]));
  assert.equal(dep.valid, true);
  const missing = validateDependencies("a", ["b"], new Set());
  assert.equal(missing.valid, false);
}

{
  const sorted = topologicalSort([
    { ...sampleManifest, pluginId: "c", dependencies: ["a"] },
    { ...sampleManifest, pluginId: "a", dependencies: [] },
    { ...sampleManifest, pluginId: "b", dependencies: ["a"] },
  ]);
  assert.equal(sorted[0].pluginId, "a");
}

{
  const cycles = detectCycles([
    { ...sampleManifest, pluginId: "x", dependencies: ["y"] },
    { ...sampleManifest, pluginId: "y", dependencies: ["x"] },
  ]);
  assert.ok(cycles.length > 0);
}

{
  assert.ok(EXTENSION_POINTS.length >= 10);
  assert.equal(isValidExtensionPoint("dashboard.widget"), true);
  assert.equal(isValidExtensionPoint("invalid"), false);
}

{
  const result = await pluginSandbox.execute(
    { companyId: "c1", installationId: "i1", pluginId: "valueor.booking-insights", permissions: ["reports.read"], settings: {} },
    {},
    "reports.read",
  );
  assert.equal(result.success, true);
}

{
  const scaffold = createPluginScaffold({ pluginId: "dev.test", name: "Test", category: "crm" });
  assert.equal(scaffold.pluginId, "dev.test");
  assert.equal(validatePluginManifest(scaffold).valid, true);
}

{
  const parsed = parseManifest({ pluginId: "test.plugin", name: "T", author: "A", version: "1.0.0", category: "crm", entryPoints: { main: "x.js" } });
  assert.equal(parsed.pluginId, "test.plugin");
}

console.log("plugin-platform tests passed");
