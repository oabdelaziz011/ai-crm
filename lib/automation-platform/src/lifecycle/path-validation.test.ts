import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateExecutionPaths, type ExecutionGraphEdge, type ExecutionGraphNode } from "./path-validation.js";

function edge(
  source: string,
  target: string,
  branchKey?: string,
  branchLabel?: string,
): ExecutionGraphEdge {
  return {
    id: `${source}->${target}${branchKey ? `:${branchKey}` : ""}`,
    source,
    target,
    branchKey,
    branchLabel,
  };
}

function node(
  id: string,
  label: string,
  options?: { isTrigger?: boolean; isTerminal?: boolean; isResumableCheckpoint?: boolean },
): ExecutionGraphNode {
  return {
    id,
    label,
    isTrigger: options?.isTrigger ?? false,
    isTerminal: options?.isTerminal ?? false,
    isResumableCheckpoint: options?.isResumableCheckpoint ?? false,
  };
}

describe("validateExecutionPaths", () => {
  it("accepts a linear workflow ending in End", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("message", "Send Message"),
        node("end", "End", { isTerminal: true }),
      ],
      edges: [edge("start", "message"), edge("message", "end")],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("accepts a branch ending in Return to Main Menu", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("menu", "Buttons"),
        node("support", "Send Message"),
        node("return-menu", "Return to Main Menu", { isTerminal: true }),
      ],
      edges: [edge("start", "menu"), edge("menu", "support"), edge("support", "return-menu")],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("reports dead ends for non-terminal nodes without outgoing edges", () => {
    const issues = validateExecutionPaths({
      nodes: [node("start", "Start", { isTrigger: true }), node("message", "Send Message")],
      edges: [edge("start", "message")],
    });

    assert.ok(issues.some((issue) => issue.id === "dead-end-message"));
    assert.match(issues.find((issue) => issue.id === "dead-end-message")!.message, /Send Message is a dead end/);
  });

  it("reports incomplete IF branches that never reach a terminal node", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("if", "If / Else"),
        node("end", "End", { isTerminal: true }),
        node("message", "Send Message"),
      ],
      edges: [
        edge("start", "if"),
        edge("if", "end", "yes", "YES"),
        edge("if", "message", "no", "NO"),
      ],
    });

    assert.ok(issues.some((issue) => issue.message.includes("Branch 'NO' ends without a terminal step.")));
    assert.equal(issues.some((issue) => issue.id === "dead-end-message"), false);
  });

  it("reports non-terminating execution cycles", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("a", "Step A"),
        node("b", "Step B"),
        node("c", "Step C"),
      ],
      edges: [edge("start", "a"), edge("a", "b"), edge("b", "c"), edge("c", "a")],
    });

    assert.ok(
      issues.some((issue) =>
        issue.message.includes("This workflow contains an execution cycle that never reaches a terminal node."),
      ),
    );
  });

  it("does not report false-positive cycles for valid return-to-menu flows", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("menu", "Buttons"),
        node("support", "Send Message"),
        node("return-menu", "Return to Main Menu", { isTerminal: true }),
      ],
      edges: [edge("start", "menu"), edge("menu", "support"), edge("support", "return-menu")],
    });

    assert.equal(
      issues.some((issue) => issue.message.includes("execution cycle")),
      false,
    );
  });

  it("warns about unreachable nodes", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("end", "End", { isTerminal: true }),
        node("customer", "Create Customer"),
      ],
      edges: [edge("start", "end")],
    });

    assert.ok(issues.some((issue) => issue.id === "unreachable-customer" && issue.severity === "warning"));
    assert.match(issues.find((issue) => issue.id === "unreachable-customer")!.message, /Node 'Create Customer' is unreachable/);
  });

  it("validates each trigger independently", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start-a", "Start A", { isTrigger: true }),
        node("start-b", "Start B", { isTrigger: true }),
        node("end-a", "End", { isTerminal: true }),
        node("message-b", "Send Message"),
      ],
      edges: [edge("start-a", "end-a"), edge("start-b", "message-b")],
    });

    assert.equal(issues.some((issue) => issue.nodeId === "start-a" && issue.severity === "error"), false);
    assert.ok(issues.some((issue) => issue.id === "dead-end-message-b"));
  });

  it("treats resumable checkpoints without outgoing edges as valid pause points", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("list", "List", { isResumableCheckpoint: true }),
        node("end", "End", { isTerminal: true }),
      ],
      edges: [edge("start", "list")],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("accepts interactive routing through switch to terminal steps", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("list", "List", { isResumableCheckpoint: true }),
        node("switch", "Switch"),
        node("book-end", "End", { isTerminal: true }),
        node("pricing-end", "End", { isTerminal: true }),
      ],
      edges: [
        edge("start", "list"),
        edge("list", "switch"),
        edge("switch", "book-end", "book", "Book"),
        edge("switch", "pricing-end", "pricing", "Pricing"),
      ],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("accepts branches ending in resumable checkpoints", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("if", "If / Else"),
        node("end", "End", { isTerminal: true }),
        node("ask", "Ask Question", { isResumableCheckpoint: true }),
      ],
      edges: [
        edge("start", "if"),
        edge("if", "end", "yes", "YES"),
        edge("if", "ask", "no", "NO"),
      ],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("accepts converging branches through merge nodes", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("if", "If / Else"),
        node("merge", "Merge"),
        node("end", "End", { isTerminal: true }),
        node("ask", "Ask Question", { isResumableCheckpoint: true }),
      ],
      edges: [
        edge("start", "if"),
        edge("if", "end", "yes", "YES"),
        edge("if", "ask", "no", "NO"),
        edge("ask", "merge"),
        edge("merge", "end"),
      ],
    });

    assert.equal(issues.some((issue) => issue.severity === "error"), false);
  });

  it("reports branch issues once without duplicating dead-end on the same branch", () => {
    const issues = validateExecutionPaths({
      nodes: [
        node("start", "Start", { isTrigger: true }),
        node("if", "If / Else"),
        node("end", "End", { isTerminal: true }),
        node("message", "Send Message"),
      ],
      edges: [
        edge("start", "if"),
        edge("if", "end", "yes", "YES"),
        edge("if", "message", "no", "NO"),
      ],
    });

    assert.ok(issues.some((issue) => issue.kind === "branch-dead-end" && issue.nodeId === "if"));
    assert.equal(issues.some((issue) => issue.kind === "dead-end" && issue.nodeId === "message"), false);
    assert.equal(issues.filter((issue) => issue.kind === "branch-dead-end" && issue.nodeId === "if").length, 1);
  });
});
