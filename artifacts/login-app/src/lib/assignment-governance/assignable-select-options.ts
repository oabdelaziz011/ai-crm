import type { AssignableEmployee } from "@workspace/assignment-governance";
import {
  EMAIL_CONVERSATION_UNASSIGNED_VALUE,
  type EmailConversationAssigneeOption,
} from "@/lib/email-workspace/email-conversation-assignment";
import {
  formatAssignableDepartmentLabel,
  formatAssignableEmployeeLabel,
} from "@/lib/assignment-governance/assignable-employee-labels";

/**
 * Build Email Workspace assignee options from the canonical governance list.
 * Unassigned is not an employee target and is never eligibility-checked.
 */
export function buildAssignableEmailSelectOptions(input: {
  employees: readonly AssignableEmployee[];
  assignedUserId: string | null | undefined;
  assignedLabel?: string | null;
  unassignedLabel: string;
}): EmailConversationAssigneeOption[] {
  const options: EmailConversationAssigneeOption[] = [
    { value: EMAIL_CONVERSATION_UNASSIGNED_VALUE, label: input.unassignedLabel },
  ];
  const seen = new Set<string>([EMAIL_CONVERSATION_UNASSIGNED_VALUE]);

  for (const employee of input.employees) {
    const userId = employee.userId.trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const deptLabel = formatAssignableDepartmentLabel(employee);
    options.push({
      value: userId,
      label: formatAssignableEmployeeLabel(employee),
      description: [employee.email, deptLabel].filter(Boolean).join(" · ") || undefined,
    });
  }

  const current = input.assignedUserId?.trim();
  if (current && !seen.has(current)) {
    options.push({
      value: current,
      label: input.assignedLabel?.trim() || current,
    });
  }

  return options;
}
