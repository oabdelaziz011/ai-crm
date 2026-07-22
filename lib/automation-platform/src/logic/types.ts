export const LOGIC_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "exists",
  "does_not_exist",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "between",
  "in_list",
  "not_in_list",
  "boolean_true",
  "boolean_false",
] as const;

export type LogicOperatorId = (typeof LOGIC_OPERATORS)[number];

export type RuleClause = {
  id: string;
  field: string;
  operator: LogicOperatorId;
  value?: unknown;
  valueTo?: unknown;
};

export type RuleGroup = {
  id: string;
  combinator: "and" | "or";
  rules: Array<RuleClause | RuleGroup>;
};

export type CompiledRuleSet = {
  root: RuleGroup;
};

export type SwitchCaseDefinition = {
  id: string;
  label: string;
  value: string | number | boolean;
};

export type SwitchNodeConfig = {
  mode: "switch";
  field: string;
  cases: SwitchCaseDefinition[];
  includeDefault: boolean;
};

export type MergeStrategy = "all" | "any";

export type EvaluationContext = {
  variables: Record<string, unknown>;
};
