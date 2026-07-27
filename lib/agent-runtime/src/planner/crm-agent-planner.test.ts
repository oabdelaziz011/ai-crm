import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CrmAgentPlanner, isCrmAgentGoal } from "./crm-agent-planner.js";
import { buildCrmAgentReport } from "./crm-report-builder.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import { VerificationService } from "../verification/verification-service.js";
import { createTaskNode } from "../task-graph/task-graph.js";

describe("CrmAgentPlanner", () => {
  const planner = new CrmAgentPlanner();

  it("plans create customer workflow with CRM agent type", () => {
    const graph = planner.tryPlan({
      workflowId: "wf-crm-1",
      goal: "Create a customer named Ahmed Mohamed",
    });
    assert.ok(graph);
    assert.equal(graph.agentType, "crm");
    assert.equal(graph.nodes.some((n) => n.tool === "create_customer"), true);
  });

  it("plans duplicate detection workflow", () => {
    const graph = planner.tryPlan({
      workflowId: "wf-crm-2",
      goal: "Find duplicate customers",
    });
    assert.ok(graph);
    assert.equal(graph.nodes.some((n) => n.tool === "find_duplicate_customers"), true);
  });

  it("plans inactive customer multi-step workflow", () => {
    const graph = planner.tryPlan({
      workflowId: "wf-crm-3",
      goal: "Find customers not contacted in 30 days",
    });
    assert.ok(graph);
    assert.equal(graph.nodes.some((n) => n.tool === "search_customer"), true);
    assert.equal(graph.nodes.some((n) => n.tool === "booking_search"), true);
  });

  it("plans knowledge-assisted onboarding answer", () => {
    const graph = planner.tryPlan({
      workflowId: "wf-crm-4",
      goal: "Search knowledge for customer onboarding",
    });
    assert.ok(graph);
    assert.equal(graph.nodes.some((n) => n.tool === "knowledge_search"), true);
  });

  it("plans merge workflow with confirmation gate", () => {
    const graph = planner.tryPlan({
      workflowId: "wf-crm-5",
      goal: "Merge duplicate customers",
      pageContext: {
        selectedRows: [{ id: "cust-1" }, { id: "cust-2" }],
      },
    });
    assert.ok(graph);
    const mergeNode = graph.nodes.find((n) => n.tool === "merge_customers");
    assert.ok(mergeNode);
    assert.equal(mergeNode.toolInput?.confirmed, false);
    assert.equal(mergeNode.verificationRule, "merge_completed");
  });
});

describe("isCrmAgentGoal", () => {
  it("detects CRM goals", () => {
    assert.equal(isCrmAgentGoal("Create a customer named Sara"), true);
    assert.equal(isCrmAgentGoal("Show weather today"), false);
  });
});

describe("VerificationService CRM rules", () => {
  const verification = new VerificationService();

  it("fails merge verification when confirmation pending", () => {
    const task = createTaskNode({
      id: "merge",
      title: "Merge",
      description: "",
      tool: "merge_customers",
      verificationRule: "merge_completed",
    });
    const result = verification.verify(task, {
      requiresConfirmation: true,
      message: "Merge requires explicit user confirmation before execution.",
    });
    assert.equal(result.passed, false);
    assert.equal(result.details?.requiresConfirmation, true);
  });

  it("passes customer exists verification", () => {
    const task = createTaskNode({
      id: "create",
      title: "Create",
      description: "",
      tool: "create_customer",
      verificationRule: "customer_exists",
    });
    const result = verification.verify(task, { customerId: "cust-123" });
    assert.equal(result.passed, true);
  });
});

describe("buildCrmAgentReport", () => {
  it("includes summary sections", () => {
    const graph = {
      workflowId: "wf-report",
      goal: "Create a customer named Ahmed",
      agentType: "crm" as const,
      nodes: [
        createTaskNode({
          id: "t1",
          title: "Create customer",
          description: "",
          tool: "create_customer",
          status: "verified",
        }),
      ],
      edges: [],
    };
    const memory = createInitialMemory(graph.goal, graph);
    memory.executionState.startedAt = new Date(Date.now() - 5000).toISOString();
    const report = buildCrmAgentReport(graph, memory, memory.executionState.startedAt as string);
    assert.match(report, /CRM Agent — Completion Report/);
    assert.match(report, /Completed tasks/);
    assert.match(report, /Create customer/);
  });
});
