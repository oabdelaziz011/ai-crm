import { registerVariableProvider, type WorkflowVariable } from "./variable-provider-registry";
import {
  INTERACTION_VARIABLE_SUBGROUP,
} from "./interaction-variables";

function variable(
  category: WorkflowVariable["category"],
  path: string,
  label: string,
  previewValue: string,
  subgroup?: string,
): WorkflowVariable {
  return {
    id: `${category}.${path}`,
    category,
    label,
    token: `{{${category}.${path}}}`,
    previewValue,
    subgroup,
  };
}

let registered = false;

export function registerBuiltInVariableProviders(): void {
  if (registered) return;
  registered = true;

  registerVariableProvider({
    id: "lookup",
    category: "lookup",
    label: "Lookup",
    listVariables: () => [
      variable("lookup", "status", "Lookup status", "found"),
      variable("lookup", "count", "Lookup match count", "1"),
      variable("lookup", "found", "Lookup unique match", "true"),
    ],
  });

  registerVariableProvider({
    id: "customer",
    category: "customer",
    label: "Customer",
    listVariables: () => [
      variable("customer", "exists", "Customer exists", "true"),
      variable("customer", "id", "Customer ID", "cust_01HXYZ"),
      variable("customer", "name", "Name", "Omar"),
      variable("customer", "email", "Email", "omar@example.com"),
      variable("customer", "phone", "Phone", "+966 50 000 0000"),
      variable("customer", "notes", "Notes", "Preferred morning appointments"),
      variable("customer", "type", "Customer type", "VIP"),
      variable("customer", "country", "Country", "Egypt"),
      variable("customer", "orders", "Total orders", "6"),
    ],
  });

  registerVariableProvider({
    id: "conversation",
    category: "conversation",
    label: "Conversation",
    listVariables: () => [
      variable(
        "conversation",
        "last_button_id",
        "Last Selection ID",
        "booking",
        INTERACTION_VARIABLE_SUBGROUP,
      ),
      variable(
        "conversation",
        "last_button_title",
        "Last Selection Label",
        "Book now",
        INTERACTION_VARIABLE_SUBGROUP,
      ),
      variable(
        "conversation",
        "last_selection_type",
        "Last Selection Type",
        "buttons",
        INTERACTION_VARIABLE_SUBGROUP,
      ),
      variable(
        "conversation",
        "last_message",
        "Last User Message",
        "I need an appointment",
        INTERACTION_VARIABLE_SUBGROUP,
      ),
      variable(
        "conversation",
        "language",
        "Customer Language",
        "ar",
        INTERACTION_VARIABLE_SUBGROUP,
      ),
      variable("conversation", "channel", "Last Channel", "WhatsApp", INTERACTION_VARIABLE_SUBGROUP),
    ],
  });

  registerVariableProvider({
    id: "booking",
    category: "booking",
    label: "Booking",
    listVariables: () => [
      variable("booking", "id", "Booking ID", "a1b2c3d4-..."),
      variable("booking", "confirmation_code", "Confirmation code", "BK-000123"),
      variable("booking", "confirmation_number", "Confirmation number", "BK-000123"),
      variable("booking", "service_name", "Service name", "Consultation"),
      variable("booking", "resource_name", "Resource / person name", "Alex"),
      variable("booking", "display_date", "Display date", "Mon, Aug 10"),
      variable("booking", "display_time", "Display time", "10:30 AM"),
      variable("booking", "customer_name", "Customer name", "Omar"),
      variable("booking", "status", "Status", "confirmed"),
      // Legacy aliases kept for existing flows
      variable("booking", "date", "Date (alias)", "Monday, 21 July"),
      variable("booking", "time", "Time (alias)", "10:30 AM"),
      variable("booking", "service", "Service (alias)", "Consultation"),
    ],
  });

  registerVariableProvider({
    id: "company",
    category: "company",
    label: "Company",
    listVariables: () => [
      variable("company", "name", "Name", "Vault Clinic"),
      variable("company", "phone", "Phone", "+966 11 000 0000"),
    ],
  });

  registerVariableProvider({
    id: "workflow",
    category: "workflow",
    label: "Workflow",
    listVariables: () => [
      variable("workflow", "name", "Workflow name", "VIP Pricing Journey"),
      variable("workflow", "step", "Current step", "If / Else"),
      variable("workflow", "run_id", "Run ID", "run_01HXYZ"),
    ],
  });

  registerVariableProvider({
    id: "system",
    category: "system",
    label: "System",
    listVariables: () => [
      variable("system", "today", "Today's date", "19 July 2026"),
      variable("system", "agent_name", "Agent name", "Sara"),
    ],
  });

  registerVariableProvider({
    id: "ai",
    category: "ai",
    label: "AI",
    listVariables: () => [
      {
        id: "workflow.decision_result",
        category: "workflow",
        label: "decision_result",
        token: "{{decision_result}}",
        previewValue: "object",
        subgroup: "ai_outputs",
      },
      {
        id: "workflow.decision_result.value.label",
        category: "workflow",
        label: "decision_result.value.label",
        token: "{{decision_result.value.label}}",
        previewValue: "complaints",
        subgroup: "ai_outputs",
      },
      {
        id: "workflow.decision_result.value.confidence",
        category: "workflow",
        label: "decision_result.value.confidence",
        token: "{{decision_result.value.confidence}}",
        previewValue: "0.92",
        subgroup: "ai_outputs",
      },
      variable("ai", "intent", "Detected intent (legacy)", "pricing_request"),
      variable("ai", "confidence", "Confidence score (legacy)", "0.92"),
    ],
  });
}
