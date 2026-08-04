import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultOperationsWorkspaceConfig } from "../config/default-operations-workspace-config.js";
import { validateOperationsWorkspaceConfig } from "../config/operations-workspace-config-validator.js";
import {
  buildAlertRulesFromConfig,
  createConfiguredWorkflowEngine,
  resolveCopilotCapabilities,
} from "../intelligence/config-driven-intelligence.js";
import { deepMergeOperationsConfig, diffOperationsConfig } from "../config/operations-config-merge.js";

test("validateOperationsWorkspaceConfig passes default clinic seed", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  const report = validateOperationsWorkspaceConfig(config);
  assert.equal(report.valid, true);
  assert.equal(report.issues.filter((i) => i.severity === "error").length, 0);
});

test("validateOperationsWorkspaceConfig fails when workspace name missing", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  config.workspaceName = "";
  const report = validateOperationsWorkspaceConfig(config);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.path === "workspaceName"));
});

test("validateOperationsWorkspaceConfig detects unknown kanban status reference", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  config.kanban.columns.push({ id: "bad", statusId: "missing_status", label: "Bad" });
  const report = validateOperationsWorkspaceConfig(config);
  assert.ok(report.issues.some((i) => i.path.startsWith("kanban.columns")));
});

test("buildAlertRulesFromConfig respects enabled flag", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  config.intelligence.alertRules = config.intelligence.alertRules.map((r) =>
    r.alertType === "vip" ? { ...r, enabled: false } : r,
  );
  const rules = buildAlertRulesFromConfig(config.intelligence);
  assert.ok(!rules.some((r) => r.alertType === "vip"));
});

test("createConfiguredWorkflowEngine uses configured stages", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  const engine = createConfiguredWorkflowEngine(config.intelligence);
  const tracker = engine.buildTracker("checked_in");
  assert.equal(tracker.find((s) => s.state === "active")?.id, "checked_in");
});

test("deepMergeOperationsConfig preserves nested sections", () => {
  const base = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  const merged = deepMergeOperationsConfig(base, { workspaceName: "Updated Clinic" });
  assert.equal(merged.workspaceName, "Updated Clinic");
  assert.ok((merged.columns ?? []).length > 0);
});

test("diffOperationsConfig detects top-level changes", () => {
  const base = buildDefaultOperationsWorkspaceConfig("clinic", "company_1");
  const changed = { ...structuredClone(base), moduleName: "Changed Module" };
  const diff = diffOperationsConfig(base, changed);
  assert.ok(diff.some((d) => d.path === "moduleName"));
});
