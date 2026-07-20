import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compileRuleSet,
  evaluateRuleSet,
  validateRuleSet,
  type CompiledRuleSet,
} from "./expression-engine.js";
import { evaluateIfElseCondition, evaluateSwitchCase } from "./condition-evaluator.js";
import { getMergeEvaluator, registerBuiltInMergeEvaluators } from "./merge-evaluator.js";
import { listOperators } from "./operator-registry.js";

describe("expression engine", () => {
  it("registers all business operators", () => {
    assert.equal(listOperators().length, 17);
  });

  it("evaluates nested AND/OR rule groups", () => {
    const ruleSet: CompiledRuleSet = compileRuleSet({
      root: {
        id: "root",
        combinator: "or",
        rules: [
          {
            id: "group-1",
            combinator: "and",
            rules: [
              { id: "r1", field: "customer.type", operator: "equals", value: "VIP" },
              { id: "r2", field: "customer.orders", operator: "greater_than", value: 5 },
            ],
          },
          { id: "r3", field: "customer.country", operator: "equals", value: "Egypt" },
        ],
      },
    });

    assert.equal(
      evaluateRuleSet(ruleSet, {
        variables: { customer: { type: "VIP", orders: 6, country: "KSA" } },
      }),
      true,
    );
    assert.equal(
      evaluateRuleSet(ruleSet, {
        variables: { customer: { type: "Standard", orders: 1, country: "Egypt" } },
      }),
      true,
    );
    assert.equal(
      evaluateRuleSet(ruleSet, {
        variables: { customer: { type: "Standard", orders: 1, country: "KSA" } },
      }),
      false,
    );
  });

  it("maps if/else evaluation to yes/no branches", () => {
    const ruleSet: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.type", operator: "equals", value: "VIP" }],
      },
    };
    assert.equal(
      evaluateIfElseCondition(ruleSet, { variables: { customer: { type: "VIP" } } }),
      "yes",
    );
    assert.equal(
      evaluateIfElseCondition(ruleSet, { variables: { customer: { type: "Standard" } } }),
      "no",
    );
  });

  it("routes switch cases by field value", () => {
    const switchCase = evaluateSwitchCase(
      {
        mode: "switch",
        field: "customer.department",
        cases: [
          { id: "sales", label: "Sales", value: "sales" },
          { id: "support", label: "Support", value: "support" },
        ],
        includeDefault: true,
      },
      { variables: { customer: { department: "support" } } },
    );
    assert.equal(switchCase, "support");
  });

  it("validates incomplete rules", () => {
    const issues = validateRuleSet({
      root: { id: "root", combinator: "and", rules: [{ id: "r1", field: "", operator: "equals", value: "" }] },
    });
    assert.ok(issues.length >= 2);
  });
});

describe("merge evaluator registry", () => {
  it("supports wait all and wait any strategies", () => {
    registerBuiltInMergeEvaluators();
    assert.equal(getMergeEvaluator("all").canProceed(2, 2), true);
    assert.equal(getMergeEvaluator("any").canProceed(1, 3), true);
  });
});
