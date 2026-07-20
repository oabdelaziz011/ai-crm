import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { listOperators, type LogicOperatorId, type RuleClause, type RuleGroup } from "@workspace/automation-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeVariableField } from "../../../core/logic/branch-utils";
import { VariablePicker } from "../../variables/variable-picker";

type RuleBuilderEditorProps = {
  ruleSet: { root: RuleGroup };
  onChange: (ruleSet: { root: RuleGroup }) => void;
};

function createClause(): RuleClause {
  return {
    id: crypto.randomUUID(),
    field: "customer.type",
    operator: "equals",
    value: "",
  };
}

function createGroup(): RuleGroup {
  return {
    id: crypto.randomUUID(),
    combinator: "and",
    rules: [createClause()],
  };
}

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function RuleClauseEditor({
  clause,
  onChange,
  onRemove,
}: {
  clause: RuleClause;
  onChange: (next: RuleClause) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("common");
  const operators = useMemo(() => listOperators(), []);
  const operator = operators.find((item) => item.id === clause.operator) ?? operators[0];

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workflowBuilder.logic.rule")}
        </Label>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2">
        <Label className="text-sm">{t("workflowBuilder.logic.field")}</Label>
        <div className="flex items-center gap-2">
          <Input
            value={clause.field}
            readOnly
            className="rounded-xl bg-background/80"
            placeholder={t("workflowBuilder.logic.chooseField")}
          />
          <VariablePicker
            onSelect={(variable) => onChange({ ...clause, field: normalizeVariableField(variable.token) })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-sm">{t("workflowBuilder.logic.operator")}</Label>
        <Select value={clause.operator} onValueChange={(value) => onChange({ ...clause, operator: value as LogicOperatorId })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder={t("workflowBuilder.logic.chooseOperator")} />
          </SelectTrigger>
          <SelectContent>
            {operators.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {operator?.requiresValue ? (
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.logic.value")}</Label>
          <Input
            value={String(clause.value ?? "")}
            onChange={(event) => onChange({ ...clause, value: event.target.value })}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}
      {operator?.requiresSecondValue ? (
        <div className="space-y-2">
          <Label className="text-sm">{t("workflowBuilder.logic.secondValue")}</Label>
          <Input
            value={String(clause.valueTo ?? "")}
            onChange={(event) => onChange({ ...clause, valueTo: event.target.value })}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}
    </div>
  );
}

function RuleGroupEditor({
  group,
  onChange,
  depth = 0,
}: {
  group: RuleGroup;
  onChange: (next: RuleGroup) => void;
  depth?: number;
}) {
  const { t } = useTranslation("common");
  const updateRule = (index: number, next: RuleClause | RuleGroup) => {
    onChange({
      ...group,
      rules: group.rules.map((entry, idx) => (idx === index ? next : entry)),
    });
  };

  const removeRule = (index: number) => {
    onChange({ ...group, rules: group.rules.filter((_, idx) => idx !== index) });
  };

  return (
    <div className={`space-y-3 ${depth > 0 ? "rounded-2xl border border-dashed border-border/70 p-3" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-medium">{depth === 0 ? t("workflowBuilder.logic.match") : t("workflowBuilder.logic.group")}</Label>
        <Select
          value={group.combinator}
          onValueChange={(value) => onChange({ ...group, combinator: value as "and" | "or" })}
        >
          <SelectTrigger className="w-[120px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">{t("workflowBuilder.logic.allAnd")}</SelectItem>
            <SelectItem value="or">{t("workflowBuilder.logic.anyOr")}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onChange({ ...group, rules: [...group.rules, createClause()] })}>
          <Plus className="me-1 h-4 w-4" />
          {t("workflowBuilder.logic.rule")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onChange({ ...group, rules: [...group.rules, createGroup()] })}>
          <Plus className="me-1 h-4 w-4" />
          {t("workflowBuilder.logic.group")}
        </Button>
      </div>

      <div className="space-y-3">
        {group.rules.map((entry, index) => (
          <div key={isRuleGroup(entry) ? entry.id : entry.id} className="space-y-2">
            {index > 0 ? (
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ChevronDown className="h-4 w-4" />
                {group.combinator === "and" ? t("workflowBuilder.logic.and") : t("workflowBuilder.logic.or")}
              </div>
            ) : null}
            {isRuleGroup(entry) ? (
              <details open className="rounded-2xl border border-border/60 bg-muted/20 p-2">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-sm font-medium">
                  <ChevronRight className="h-4 w-4" />
                  {t("workflowBuilder.logic.nestedGroup")}
                </summary>
                <div className="pt-2">
                  <RuleGroupEditor group={entry} onChange={(next) => updateRule(index, next)} depth={depth + 1} />
                  <Button type="button" variant="ghost" size="sm" className="mt-2 rounded-xl" onClick={() => removeRule(index)}>
                    {t("workflowBuilder.logic.removeGroup")}
                  </Button>
                </div>
              </details>
            ) : (
              <RuleClauseEditor clause={entry} onChange={(next) => updateRule(index, next)} onRemove={() => removeRule(index)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuleBuilderEditor({ ruleSet, onChange }: RuleBuilderEditorProps) {
  return (
    <RuleGroupEditor
      group={ruleSet.root}
      onChange={(root) => onChange({ root })}
    />
  );
}
