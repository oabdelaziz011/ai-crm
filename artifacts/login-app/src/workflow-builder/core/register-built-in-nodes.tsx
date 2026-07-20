import { createDefaultIfElseRuleGroup } from "@workspace/automation-platform";
import { registerWorkflowNode } from "./node-registry";
import type { ValidationIssue } from "./types";
import {
  EmptyProperties,
  ListRowsEditor,
  TextFieldEditor,
  requiredTextIssue,
} from "../components/properties/property-editors";
import { MessageFieldEditor } from "../components/properties/rich-editors/message-field-editor";
import { RichButtonListEditor } from "../components/properties/rich-editors/button-list-editor";
import { QuestionFieldEditor } from "../components/properties/rich-editors/question-field-editor";
import {
  EnhancedDelayEditor,
  MergeEditor,
  SwitchEditor,
  WaitForReplyEditor,
} from "../components/properties/logic/logic-node-editors";
import { RuleBuilderEditor } from "../components/properties/logic/rule-builder-editor";
import { registerAIWorkflowNodes } from "./register-ai-workflow-nodes";
import { registerAIExtractWorkflowNode } from "./register-ai-extract-node";
import { registerAIDecisionWorkflowNode } from "./register-ai-decision-node";
import { registerAIKnowledgeSearchWorkflowNode } from "./register-ai-knowledge-search-node";

function withBuilderType(builderType: string, config: Record<string, unknown>) {
  return { builderType, ...config };
}

function matchBuilderType(builderType: string) {
  return (_engineType: unknown, config: Record<string, unknown>) =>
    config.builderType === builderType ? { ...config } : null;
}

let registered = false;

export function registerBuiltInWorkflowNodes(): void {
  if (registered) return;
  registered = true;

  registerWorkflowNode({
    id: "start",
    displayName: "Start",
    description: "Begins when someone sends a message.",
    category: "conversation",
    engineType: "trigger",
    icon: "Play",
    accentClass: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
    searchKeywords: ["start", "begin", "trigger"],
    defaultConfig: { label: "When someone messages you" },
    maxOutgoing: 1,
    allowIncoming: false,
    allowOutgoing: true,
    PropertyEditor: () => <EmptyProperties labelKey="start" />,
    validate: () => [],
    toEngineConfig: (config) => withBuilderType("start", { initialVariables: {}, label: config.label }),
    fromEngineConfig: matchBuilderType("start"),
  });

  registerWorkflowNode({
    id: "send_message",
    displayName: "Send Message",
    description: "Send a friendly message to your customer.",
    category: "conversation",
    engineType: "action",
    icon: "MessageSquare",
    accentClass: "from-sky-500/20 to-sky-500/5 border-sky-500/30",
    searchKeywords: ["message", "send", "welcome", "text"],
    defaultConfig: {
      message: "Hello 👋\nWelcome to our clinic.",
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <MessageFieldEditor {...props} field="message" />,
    validate: (config, nodeId) => requiredTextIssue("message", "message", nodeId, config),
    toEngineConfig: (config) =>
      withBuilderType("send_message", { action: "send_message", message: config.message, channel: "whatsapp" }),
    fromEngineConfig: matchBuilderType("send_message"),
  });

  registerWorkflowNode({
    id: "ask_question",
    displayName: "Ask Question",
    description: "Ask a question and wait for a reply.",
    category: "conversation",
    engineType: "action",
    icon: "HelpCircle",
    accentClass: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    searchKeywords: ["question", "ask", "customer", "name", "input"],
    defaultConfig: {
      question: "What is your name?",
      saveAs: "customer_name",
      required: true,
      placeholder: "Type your name",
      validationMessage: "Please enter your name to continue.",
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <QuestionFieldEditor {...props} />,
    validate: (config, nodeId) => [
      ...requiredTextIssue("question", "question", nodeId, config),
      ...requiredTextIssue("saveAs", "saveAs", nodeId, config),
    ],
    toEngineConfig: (config) =>
      withBuilderType("ask_question", {
        action: "wait_for_input",
        prompt: config.question,
        inputKey: config.saveAs,
      }),
    fromEngineConfig: matchBuilderType("ask_question"),
  });

  registerWorkflowNode({
    id: "wait_for_reply",
    displayName: "Wait For Reply",
    description: "Pause until the customer sends their next message.",
    category: "conversation",
    engineType: "action",
    icon: "MessageCircle",
    accentClass: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
    searchKeywords: ["wait", "reply", "pause", "conversation"],
    defaultConfig: { saveAs: "last_reply", prompt: "" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <WaitForReplyEditor {...props} />,
    validate: (config, nodeId) => requiredTextIssue("saveAs", "replySaveAs", nodeId, config),
    toEngineConfig: (config) =>
      withBuilderType("wait_for_reply", {
        action: "wait_for_reply",
        prompt: config.prompt,
        inputKey: config.saveAs,
      }),
    fromEngineConfig: matchBuilderType("wait_for_reply"),
  });

  registerWorkflowNode({
    id: "buttons",
    displayName: "Buttons",
    description: "Offer quick reply buttons.",
    category: "conversation",
    engineType: "action",
    icon: "LayoutGrid",
    accentClass: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
    searchKeywords: ["buttons", "choices", "menu", "message"],
    defaultConfig: {
      buttons: [
        { id: "book", label: "Book Appointment" },
        { id: "pricing", label: "Pricing" },
        { id: "support", label: "Talk to Support" },
      ],
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <RichButtonListEditor {...props} />,
    validate: (config, nodeId) => {
      const issues: ValidationIssue[] = requiredTextIssue("message", "message", nodeId, config);
      const buttons = Array.isArray(config.buttons) ? config.buttons : [];
      if (buttons.filter((button) => typeof button === "object" && String((button as { label?: string }).label ?? "").trim()).length === 0) {
        issues.push({
          id: `${nodeId}-buttons`,
          nodeId,
          message: "Add at least one button label before publishing.",
          severity: "error",
        });
      }
      return issues;
    },
    toEngineConfig: (config) =>
      withBuilderType("buttons", { action: "send_buttons", message: config.message, buttons: config.buttons }),
    fromEngineConfig: matchBuilderType("buttons"),
  });

  registerWorkflowNode({
    id: "list",
    displayName: "List",
    description: "Show a menu of options.",
    category: "conversation",
    engineType: "action",
    icon: "List",
    accentClass: "from-orange-500/20 to-orange-500/5 border-orange-500/30",
    defaultConfig: {
      title: "Choose a service",
      body: "Pick the option that fits you best.",
      buttonLabel: "View options",
      rows: [{ id: "1", title: "Option 1", description: "" }],
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="menuTitle" field="title" />
        <TextFieldEditor {...props} labelKey="menuMessage" field="body" multiline />
        <TextFieldEditor {...props} labelKey="menuButtonLabel" field="buttonLabel" />
        <ListRowsEditor {...props} />
      </div>
    ),
    validate: (config, nodeId) => {
      const issues: ValidationIssue[] = [
        ...requiredTextIssue("title", "title", nodeId, config),
        ...requiredTextIssue("body", "body", nodeId, config),
      ];
      const rows = Array.isArray(config.rows) ? config.rows : [];
      if (
        rows.filter(
          (row) => typeof row === "object" && String((row as { title?: string }).title ?? "").trim().length > 0,
        ).length === 0
      ) {
        issues.push({
          id: `${nodeId}-rows`,
          nodeId,
          message: "Add at least one list option before publishing.",
          severity: "error",
        });
      }
      return issues;
    },
    toEngineConfig: (config) =>
      withBuilderType("list", {
        action: "send_list",
        title: config.title,
        body: config.body,
        buttonLabel: config.buttonLabel,
        sections: [{ title: "Options", rows: config.rows }],
      }),
    fromEngineConfig: matchBuilderType("list"),
  });

  registerWorkflowNode({
    id: "if_else",
    displayName: "If / Else",
    description: "Route customers based on visual rules.",
    category: "logic",
    engineType: "condition",
    icon: "GitBranch",
    accentClass: "from-orange-500/20 to-orange-500/5 border-orange-500/30",
    searchKeywords: ["if", "else", "condition", "rule", "branch"],
    defaultConfig: { ruleSet: { root: createDefaultIfElseRuleGroup() } },
    maxOutgoing: 2,
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <RuleBuilderEditor
        ruleSet={(props.config.ruleSet as { root: ReturnType<typeof createDefaultIfElseRuleGroup> }) ?? { root: createDefaultIfElseRuleGroup() }}
        onChange={(ruleSet) => props.onChange({ ruleSet })}
      />
    ),
    validate: () => [],
    toEngineConfig: (config) => withBuilderType("if_else", { ruleSet: config.ruleSet }),
    fromEngineConfig: matchBuilderType("if_else"),
  });

  registerWorkflowNode({
    id: "switch",
    displayName: "Switch",
    description: "Route customers by matching a field to cases.",
    category: "logic",
    engineType: "condition",
    icon: "Split",
    accentClass: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
    searchKeywords: ["switch", "route", "department", "case"],
    defaultConfig: {
      field: "customer.type",
      cases: [
        { id: "sales", label: "Sales", value: "sales" },
        { id: "support", label: "Support", value: "support" },
        { id: "finance", label: "Finance", value: "finance" },
      ],
      includeDefault: true,
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <SwitchEditor {...props} />,
    validate: () => [],
    toEngineConfig: (config) =>
      withBuilderType("switch", {
        mode: "switch",
        field: config.field,
        cases: config.cases,
        includeDefault: config.includeDefault,
      }),
    fromEngineConfig: matchBuilderType("switch"),
  });

  registerWorkflowNode({
    id: "merge",
    displayName: "Merge",
    description: "Bring multiple paths back together.",
    category: "logic",
    engineType: "action",
    icon: "GitMerge",
    accentClass: "from-teal-500/20 to-teal-500/5 border-teal-500/30",
    searchKeywords: ["merge", "join", "combine", "paths"],
    defaultConfig: { strategy: "all", label: "Merge paths" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <MergeEditor {...props} />,
    validate: () => [],
    toEngineConfig: (config) =>
      withBuilderType("merge", { action: "merge_wait", strategy: config.strategy ?? "all", label: config.label }),
    fromEngineConfig: matchBuilderType("merge"),
  });

  registerWorkflowNode({
    id: "delay",
    displayName: "Delay",
    description: "Wait before the next step.",
    category: "conversation",
    engineType: "delay",
    icon: "Timer",
    accentClass: "from-slate-500/20 to-slate-500/5 border-slate-500/30",
    defaultConfig: { duration: 1, unit: "minutes", waitMinutes: 1, label: "Wait a moment", businessHoursOnly: false },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <EnhancedDelayEditor {...props} />,
    validate: (config, nodeId) => {
      const duration = Number(config.duration ?? config.waitMinutes ?? 0);
      if (duration > 0) return [];
      return [{ id: `${nodeId}-delay`, nodeId, message: "Enter a wait time greater than zero.", severity: "error" }];
    },
    toEngineConfig: (config) =>
      withBuilderType("delay", {
        duration: config.duration ?? config.waitMinutes,
        unit: config.unit ?? "minutes",
        businessHoursOnly: config.businessHoursOnly === true,
        marker: `delay-${config.duration ?? config.waitMinutes}${config.unit ?? "m"}`,
        waitMinutes: config.waitMinutes ?? config.duration,
      }),
    fromEngineConfig: matchBuilderType("delay"),
  });

  registerWorkflowNode({
    id: "end",
    displayName: "End",
    description: "Finish the conversation.",
    category: "conversation",
    engineType: "end",
    icon: "Flag",
    accentClass: "from-rose-500/20 to-rose-500/5 border-rose-500/30",
    defaultConfig: { label: "Finish conversation" },
    allowIncoming: true,
    allowOutgoing: false,
    PropertyEditor: () => <EmptyProperties labelKey="end" />,
    validate: () => [],
    toEngineConfig: (config) => withBuilderType("end", { label: config.label }),
    fromEngineConfig: matchBuilderType("end"),
  });

  registerWorkflowNode({
    id: "create_customer",
    displayName: "Create Customer",
    description: "Save a new customer record.",
    category: "crm",
    engineType: "action",
    icon: "UserPlus",
    accentClass: "from-teal-500/20 to-teal-500/5 border-teal-500/30",
    searchKeywords: ["create customer", "customer", "crm", "new customer"],
    defaultConfig: { nameField: "customer_name", emailField: "", phoneField: "" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="nameField" field="nameField" placeholder="customer_name" />
        <TextFieldEditor {...props} labelKey="emailField" field="emailField" />
        <TextFieldEditor {...props} labelKey="phoneField" field="phoneField" />
      </div>
    ),
    validate: (config, nodeId) => requiredTextIssue("nameField", "nameField", nodeId, config),
    toEngineConfig: (config) => withBuilderType("create_customer", { action: "create_customer", ...config }),
    fromEngineConfig: matchBuilderType("create_customer"),
  });

  registerWorkflowNode({
    id: "update_customer",
    displayName: "Update Customer",
    description: "Update an existing customer record.",
    category: "crm",
    engineType: "action",
    icon: "UserPen",
    accentClass: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
    defaultConfig: { field: "email", value: "" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="fieldToUpdate" field="field" />
        <TextFieldEditor {...props} labelKey="newValue" field="value" />
      </div>
    ),
    validate: (config, nodeId) => [
      ...requiredTextIssue("field", "field", nodeId, config),
      ...requiredTextIssue("value", "value", nodeId, config),
    ],
    toEngineConfig: (config) => withBuilderType("update_customer", { action: "update_customer", ...config }),
    fromEngineConfig: matchBuilderType("update_customer"),
  });

  registerWorkflowNode({
    id: "create_booking",
    displayName: "Create Booking",
    description: "Create an appointment booking.",
    category: "crm",
    engineType: "action",
    icon: "CalendarPlus",
    accentClass: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
    defaultConfig: { serviceName: "Consultation", dateField: "booking_date" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="serviceName" field="serviceName" />
        <TextFieldEditor {...props} labelKey="dateField" field="dateField" placeholder="booking_date" />
      </div>
    ),
    validate: (config, nodeId) => [
      ...requiredTextIssue("serviceName", "serviceName", nodeId, config),
      ...requiredTextIssue("dateField", "dateField", nodeId, config),
    ],
    toEngineConfig: (config) => withBuilderType("create_booking", { action: "create_booking", ...config }),
    fromEngineConfig: matchBuilderType("create_booking"),
  });

  registerAIWorkflowNodes();
  registerAIExtractWorkflowNode();
  registerAIDecisionWorkflowNode();
  registerAIKnowledgeSearchWorkflowNode();
}
