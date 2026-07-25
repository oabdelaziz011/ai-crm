import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateIfNodeWithDiagnostics } from "./if-node-trace-debug.js";
import type { CompiledRuleSet } from "../logic/types.js";

describe("if-node trace diagnostics", () => {
  it("collects clause comparisons and branch outcome", () => {
    const ruleSet: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "r1",
            field: "conversation.last_button_id",
            operator: "equals",
            value: "dr3",
          },
        ],
      },
    };

    const evaluation = evaluateIfNodeWithDiagnostics(ruleSet, {
      conversation: { last_button_id: "dr3", last_button_title: "Dr Three" },
      interactive_selection: "dr3",
    });

    assert.equal(evaluation.branch, "yes");
    assert.equal(evaluation.clauses.length, 1);
    assert.equal(evaluation.clauses[0]?.field, "conversation.last_button_id");
    assert.equal(evaluation.clauses[0]?.expectedValue, "dr3");
    assert.equal(evaluation.clauses[0]?.actualValue, "dr3");
    assert.equal(evaluation.clauses[0]?.matched, true);
    assert.equal(evaluation.resolvedFieldValues["conversation.last_button_id"], "dr3");
    assert.equal(evaluation.matchedRuleIndex, 0);
  });

  it("reports the first failed clause index on NO branch", () => {
    const ruleSet: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "r1",
            field: "conversation.last_button_id",
            operator: "equals",
            value: "dr3",
          },
        ],
      },
    };

    const evaluation = evaluateIfNodeWithDiagnostics(ruleSet, {
      conversation: { last_button_id: "Dr Three" },
    });

    assert.equal(evaluation.branch, "no");
    assert.equal(evaluation.clauses[0]?.matched, false);
    assert.equal(evaluation.matchedRuleIndex, 0);
    assert.match(evaluation.evaluationReason, /Clause 0 failed/);
  });
});
