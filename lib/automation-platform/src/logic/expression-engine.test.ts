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
    assert.equal(listOperators().length, 19);
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

  it("matches decision Title-Case labels to lowercase switch values", () => {
    const switchCase = evaluateSwitchCase(
      {
        mode: "switch",
        field: "decision_result.value.label",
        cases: [
          { id: "support", label: "Support", value: "support" },
          { id: "pricing", label: "Pricing", value: "pricing" },
          { id: "booking", label: "Booking", value: "finance" },
        ],
        includeDefault: true,
      },
      { variables: { decision_result: { value: { label: "Pricing" } } } },
    );
    assert.equal(switchCase, "pricing");

    const booking = evaluateSwitchCase(
      {
        mode: "switch",
        field: "decision_result.value.label",
        cases: [
          { id: "pricing", label: "Pricing", value: "pricing" },
          { id: "booking", label: "Booking", value: "finance" },
        ],
        includeDefault: true,
      },
      { variables: { decision_result: { value: { label: "Booking" } } } },
    );
    assert.equal(booking, "finance");
  });

  it("evaluates conversation button runtime variables", () => {
    const ruleSet: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "conversation.last_button_id", operator: "equals", value: "booking" }],
      },
    };

    assert.equal(
      evaluateIfElseCondition(ruleSet, {
        variables: {
          conversation: {
            last_button_id: "booking",
            last_button_title: "Book now",
            last_message: "Book now",
          },
        },
      }),
      "yes",
    );
    assert.equal(
      evaluateIfElseCondition(ruleSet, {
        variables: {
          conversation: {
            last_button_id: "support",
            last_button_title: "Support",
          },
        },
      }),
      "no",
    );
  });

  it("validates incomplete rules", () => {
    const issues = validateRuleSet({
      root: { id: "root", combinator: "and", rules: [{ id: "r1", field: "", operator: "equals", value: "" }] },
    });
    assert.ok(issues.length >= 2);
  });

  it("evaluates existence operators without comparison values", () => {
    const existsRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.id", operator: "exists" }],
      },
    };
    const missingRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.id", operator: "does_not_exist" }],
      },
    };
    const emptyEmailRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.email", operator: "is_empty" }],
      },
    };
    const nonEmptyEmailRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.email", operator: "is_not_empty" }],
      },
    };

    assert.equal(evaluateRuleSet(existsRule, { variables: { customer: { id: "cust-1" } } }), true);
    assert.equal(evaluateRuleSet(existsRule, { variables: { customer: { id: null } } }), false);
    assert.equal(evaluateRuleSet(existsRule, { variables: {} }), false);

    assert.equal(evaluateRuleSet(missingRule, { variables: {} }), true);
    assert.equal(evaluateRuleSet(missingRule, { variables: { customer: { id: null } } }), true);
    assert.equal(evaluateRuleSet(missingRule, { variables: { customer: { id: "cust-1" } } }), false);

    assert.equal(evaluateRuleSet(emptyEmailRule, { variables: { customer: { email: "" } } }), true);
    assert.equal(evaluateRuleSet(emptyEmailRule, { variables: { customer: { email: "   " } } }), true);
    assert.equal(evaluateRuleSet(emptyEmailRule, { variables: { customer: {} } }), true);
    assert.equal(evaluateRuleSet(emptyEmailRule, { variables: { customer: { email: "omar@example.com" } } }), false);

    const emptyCollectionRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.tags", operator: "is_empty" }],
      },
    };
    assert.equal(evaluateRuleSet(emptyCollectionRule, { variables: { customer: { tags: [] } } }), true);
    assert.equal(evaluateRuleSet(emptyCollectionRule, { variables: { customer: { tags: ["vip"] } } }), false);

    const emptyObjectRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.meta", operator: "is_empty" }],
      },
    };
    assert.equal(evaluateRuleSet(emptyObjectRule, { variables: { customer: { meta: {} } } }), true);
    assert.equal(evaluateRuleSet(emptyObjectRule, { variables: { customer: { meta: { tier: "vip" } } } }), false);

    assert.equal(
      evaluateRuleSet(nonEmptyEmailRule, { variables: { customer: { email: "omar@example.com" } } }),
      true,
    );
    assert.equal(evaluateRuleSet(nonEmptyEmailRule, { variables: { customer: { email: "" } } }), false);

    const nonEmptyCollectionRule: CompiledRuleSet = {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "customer.tags", operator: "is_not_empty" }],
      },
    };
    assert.equal(evaluateRuleSet(nonEmptyCollectionRule, { variables: { customer: { tags: ["vip"] } } }), true);
  });

  it("does not require values for existence operators during validation", () => {
    const issues = validateRuleSet({
      root: {
        id: "root",
        combinator: "and",
        rules: [
          { id: "r1", field: "customer.id", operator: "exists" },
          { id: "r2", field: "customer.email", operator: "is_empty" },
        ],
      },
    });
    assert.equal(issues.length, 0);
  });
});

describe("merge evaluator registry", () => {
  it("supports wait all and wait any strategies", () => {
    registerBuiltInMergeEvaluators();
    assert.equal(getMergeEvaluator("all").canProceed(2, 2), true);
    assert.equal(getMergeEvaluator("any").canProceed(1, 3), true);
  });
});
