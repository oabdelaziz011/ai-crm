# Sprint B2-03 — Enterprise Logic & Decision Engine

## Summary

Sprint B2-03 adds visual decision-making to the VaultOS Workflow Builder without changing the Automation Engine schema, transport layer, or persistence tables. Business users can build If / Else rules, Switch routing, Merge convergence, Wait For Reply pauses, and enhanced Delay steps using form-based editors — never expression syntax.

## Architecture

```
Workflow Builder UI
  ├─ Rule Builder (visual cards, nested AND/OR groups)
  ├─ Switch / Merge / Delay / Wait editors
  ├─ Variable Picker (Customer, Conversation, Booking, Company, Workflow, System, Future AI)
  └─ Branch-colored canvas edges (YES green, NO red, Switch palette)

Builder State → Workflow Mapper → automation_flows / nodes / edges (unchanged tables)

Automation Platform
  └─ logic/
      ├─ expression-engine (compile + evaluate rule sets)
      ├─ operator-registry (18 business operators)
      ├─ rule-provider-registry
      ├─ condition-evaluator (if/else + switch)
      ├─ merge-evaluator registry (all / any)
      └─ expression-function-registry (extensibility hook)

Runtime (existing pipeline)
  ├─ condition nodes → ruleSet or switch mode → __branch / __switchCase
  ├─ flow-graph.resolveNextNodeId → edge.condition.branch | case
  ├─ action.wait_for_reply → existing waiting_input lifecycle
  ├─ action.merge_wait → pass-through with strategy metadata
  └─ delay → __delayUntil metadata (minutes/hours/days, business-hours flag)
```

## Node Mapping (backward compatible)

| Builder node     | Engine type | Engine config highlight                          |
|------------------|------------|--------------------------------------------------|
| if_else          | condition  | `ruleSet` compiled by expression engine          |
| switch           | condition  | `mode: "switch"`, cases, default branch          |
| merge            | action     | `action: "merge_wait"`, strategy `all` / `any`    |
| wait_for_reply   | action     | `action: "wait_for_reply"` (same as wait input)  |
| delay (enhanced) | delay      | duration + unit + businessHoursOnly metadata     |

Legacy condition nodes (`variable` + `equals`) continue to work unchanged.

## Validation

Blocking publish checks include:

- Missing YES / NO branches on If / Else
- Empty or incomplete rule groups
- Switch field, cases, duplicate values, missing case/default branches
- Disconnected steps and cycles (existing)
- Per-node field validation (existing)

## Extensibility

Future plugins can register:

- Operators (`registerOperator`)
- Rule providers (`registerRuleProvider`)
- Expression functions (`registerExpressionFunction`)
- Merge strategies (`registerMergeEvaluator`)

The UI and mapper never depend on evaluation internals.

## Tests

- `pnpm --dir lib/automation-platform test` — expression engine, operators, switch routing, merge registry, flow-graph branches
- `pnpm --dir artifacts/login-app test:workflow-builder-core` — node registry, branch validation, edge colors, persistence mapping

## Success Criteria Met

Business users can visually build:

1. **VIP pricing flow** — If Customer Type = VIP → Send VIP message, Else → Send standard message
2. **Department routing** — Switch on department field with Sales / Support / Finance branches + Default

No code, no expression syntax, fully compatible with the existing Automation Engine execution pipeline.
