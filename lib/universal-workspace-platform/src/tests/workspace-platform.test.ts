import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDefaultOperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import { workspaceEngine } from "../engine/workspace-engine.js";
import { commandEngine } from "../engine/command-engine.js";
import { searchEngine } from "../engine/search-engine.js";
import { notificationEngine } from "../engine/notification-engine.js";
import { activityEngine } from "../engine/activity-engine.js";
import { designerEngine } from "../engine/designer-engine.js";
import { personalizationEngine } from "../engine/personalization-engine.js";
import { workspacePlatformOrchestrator } from "../engine/platform-orchestrator.js";
import { WORKSPACE_TEMPLATES } from "../engine/template-registry.js";
import { DESIGNER_PALETTE } from "../mock/mock-designer.js";
import { OperationsRuntimeConfigurationError } from "@workspace/universal-operations-engine";

describe("Universal Workspace Platform", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "test-company");

  it("resolves customer workspace from published configuration", () => {
    const ws = workspaceEngine.resolve("customer", "clinic", config.customer360.sections);
    assert.equal(ws.entityType, "customer");
    assert.ok(ws.blocks.length > 0);
  });

  it("throws when customer360 sections are missing", () => {
    assert.throws(
      () => workspaceEngine.resolve("customer", "clinic", []),
      OperationsRuntimeConfigurationError,
    );
  });

  it("resolves generic entity workspace", () => {
    const ws = workspaceEngine.resolve("ticket", "clinic");
    assert.equal(ws.entityType, "ticket");
    assert.ok(ws.blocks.some((b) => b.type === "timeline"));
  });

  it("filters commands by role", () => {
    const cmds = commandEngine.list("cashier");
    assert.ok(cmds.some((c) => c.actionKey === "collect_payment"));
    assert.ok(!cmds.some((c) => c.actionKey === "nav_designer"));
  });

  it("searches global index with grouping", () => {
    const results = searchEngine.search("sara");
    assert.ok(results.length > 0);
    const groups = searchEngine.groupResults(results);
    assert.ok(groups.length > 0);
  });

  it("tracks notification unread count", () => {
    assert.ok(notificationEngine.unreadCount() > 0);
    notificationEngine.markAllRead();
    assert.equal(notificationEngine.unreadCount(), 0);
  });

  it("groups activity by period", () => {
    const groups = activityEngine.groupByPeriod();
    assert.ok(groups.some((g) => g.period === "today"));
  });

  it("supports designer add/remove blocks", () => {
    let state = designerEngine.createState("Test", "clinic");
    const item = DESIGNER_PALETTE[0]!;
    state = designerEngine.addBlock(state, item);
    assert.equal(state.canvasBlocks.length, 1);
    state = designerEngine.removeBlock(state, state.canvasBlocks[0]!.id);
    assert.equal(state.canvasBlocks.length, 0);
  });

  it("persists personalization per user", () => {
    personalizationEngine.update("user_1", { density: "compact" });
    assert.equal(personalizationEngine.get("user_1").density, "compact");
  });

  it("orchestrator builds full platform snapshot from configuration", () => {
    const snap = workspacePlatformOrchestrator.buildSnapshot(
      { entityType: "customer", entityId: "c1", entityLabel: "Sara", templateKey: "clinic" },
      "user_1",
      "manager",
      config,
    );
    assert.ok(snap.widgets.length > 0);
    assert.ok(snap.commands.length > 0);
    assert.equal(WORKSPACE_TEMPLATES.length, 13);
  });
});
