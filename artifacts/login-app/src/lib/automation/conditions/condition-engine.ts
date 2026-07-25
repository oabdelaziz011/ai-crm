import type {
  AutomationCondition,
  AutomationContext,
  AutomationConditionField,
  ConditionGroup,
} from "@/lib/automation/types";

function readContextValue(context: AutomationContext, field: AutomationConditionField): string | string[] | null {
  switch (field) {
    case "branch":
      return context.branchId ?? null;
    case "company":
      return context.companyId;
    case "customer_tag":
      return context.customerTags ?? [];
    case "booking_status":
      return context.bookingStatus ?? null;
    case "resource":
      return context.resourceId ?? null;
    case "priority":
      return context.priority ?? null;
    case "tenant":
      return context.companyId;
    case "date":
      return context.triggeredAt.slice(0, 10);
    case "time_window":
      return context.triggeredAt;
    default:
      return null;
  }
}

function evaluateLeaf(condition: AutomationCondition, context: AutomationContext): boolean {
  const actual = readContextValue(context, condition.field);
  const expected = condition.value;

  if (actual == null) return false;

  switch (condition.operator) {
    case "eq":
      return String(actual) === String(expected);
    case "neq":
      return String(actual) !== String(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(String(actual));
    case "contains":
      if (Array.isArray(actual)) return actual.includes(String(expected));
      return String(actual).includes(String(expected));
    case "between": {
      if (typeof expected !== "object" || Array.isArray(expected)) return false;
      const value = String(actual);
      const from = expected.from ?? "";
      const to = expected.to ?? "";
      return value >= from && value <= to;
    }
    case "before": {
      if (typeof expected !== "object" || Array.isArray(expected)) return false;
      return String(actual) < (expected.from ?? "");
    }
    case "after": {
      if (typeof expected !== "object" || Array.isArray(expected)) return false;
      return String(actual) > (expected.from ?? "");
    }
    default:
      return false;
  }
}

function isConditionGroup(node: AutomationCondition | ConditionGroup): node is ConditionGroup {
  return "operator" in node && "conditions" in node && !("field" in node);
}

/** Composable condition evaluation with AND/OR groups. */
export class ConditionEngine {
  evaluate(group: ConditionGroup, context: AutomationContext): boolean {
    if (!group.conditions.length) return true;

    if (group.operator === "and") {
      return group.conditions.every((node) => this.evaluateNode(node, context));
    }
    return group.conditions.some((node) => this.evaluateNode(node, context));
  }

  private evaluateNode(node: AutomationCondition | ConditionGroup, context: AutomationContext): boolean {
    if (isConditionGroup(node)) return this.evaluate(node, context);
    return evaluateLeaf(node, context);
  }
}

export const conditionEngine = new ConditionEngine();

export function memoizeConditionKey(group: ConditionGroup, context: AutomationContext): string {
  return JSON.stringify({ group, context: {
    companyId: context.companyId,
    branchId: context.branchId,
    customerId: context.customerId,
    bookingStatus: context.bookingStatus,
    resourceId: context.resourceId,
    priority: context.priority,
    triggeredAt: context.triggeredAt,
  }});
}
