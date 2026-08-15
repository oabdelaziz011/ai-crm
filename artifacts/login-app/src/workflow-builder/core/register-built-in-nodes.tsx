import { createDefaultIfElseRuleGroup } from "@workspace/automation-platform";
import { registerWorkflowNode } from "./node-registry";
import type { ValidationIssue } from "./types";
import {
  EmptyProperties,
  TextFieldEditor,
  requiredTextIssue,
} from "../components/properties/property-editors";
import { ListOptionsEditor } from "../components/properties/conversation/list-options-editor";
import {
  normalizeListNodeConfig,
  readListDataSourceMode,
  readListLookupConfig,
  validateListNodeOptions,
  validateListVariableBinding,
} from "./conversation/list-node-config";
import { resolveLookupOutputVariableName } from "@/lib/lookups";
import { MessageFieldEditor, hasBilingualOrLegacyMessage, bilingualMapPassthrough } from "../components/properties/rich-editors/message-field-editor";
import { hasBilingualOrLegacyText } from "./conversation/bilingual-text";
import { RichButtonListEditor, buttonHasAnyLabel } from "../components/properties/rich-editors/button-list-editor";
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
import { CreateBookingPropertyEditor } from "../components/properties/crm/create-booking-property-editor";
import { CreateTicketPropertyEditor } from "../components/properties/crm/create-ticket-property-editor";
import { FindTicketPropertyEditor } from "../components/properties/crm/find-ticket-property-editor";
import { FindCustomerPropertyEditor } from "../components/properties/crm/find-customer-property-editor";
import {
  createDefaultCreateBookingConfig,
  normalizeCreateBookingNodeConfig,
  validateCreateBookingConfig,
} from "./crm/create-booking-config";
import {
  createDefaultCreateTicketConfig,
  normalizeCreateTicketNodeConfig,
  validateCreateTicketConfig,
} from "./crm/create-ticket-config";
import {
  createDefaultFindTicketConfig,
  normalizeFindTicketNodeConfig,
  validateFindTicketConfig,
} from "./crm/find-ticket-config";
import {
  createDefaultFindCustomerNodeConfig,
  normalizeFindCustomerNodeConfig,
  validateFindCustomerConfig,
} from "./crm/find-customer-config";
import {
  createDefaultAskQuestionConfig,
  normalizeAskQuestionNodeConfig,
} from "./conversation/ask-question-config";
import {
  createDefaultWaitForReplyConfig,
  normalizeWaitForReplyNodeConfig,
} from "./conversation/wait-for-reply-config";
import { PrimaryMenuToggle } from "../components/properties/conversation/primary-menu-toggle";
import { ListVariableBindingEditor } from "../components/properties/rich-editors/list-variable-binding-editor";
import { DatePickerOptionsEditor } from "../components/properties/conversation/date-picker-options-editor";
import {
  createDefaultDatePickerConfig,
  normalizeDatePickerNodeConfig,
  validateDatePickerNodeConfig,
} from "./conversation/date-picker-node-config";

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
      messages: {
        ar: "أهلاً بك 👋\nمرحبًا بكم في عيادتنا.",
        en: "Hello 👋\nWelcome to our clinic.",
      },
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <MessageFieldEditor {...props} field="message" />,
    validate: (config, nodeId) => {
      if (hasBilingualOrLegacyMessage(config)) return [];
      return requiredTextIssue("message", "message", nodeId, config);
    },
    toEngineConfig: (config) =>
      withBuilderType("send_message", {
        action: "send_message",
        message: config.message,
        ...(config.messages && typeof config.messages === "object" ? { messages: config.messages } : {}),
        channel: "whatsapp",
      }),
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
    defaultConfig: createDefaultAskQuestionConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <QuestionFieldEditor {...props} />,
    validate: (config, nodeId) => {
      const issues: ValidationIssue[] = [];
      if (!hasBilingualOrLegacyText(config, "questions", "question", ["prompts", "messages"], ["prompt", "message"])) {
        issues.push(...requiredTextIssue("question", "question", nodeId, config));
      }
      issues.push(...requiredTextIssue("saveAs", "saveAs", nodeId, config));
      return issues;
    },
    toEngineConfig: (config) => {
      const normalized = normalizeAskQuestionNodeConfig(config);
      return withBuilderType("ask_question", {
        action: "wait_for_input",
        prompt: normalized.question,
        question: normalized.question,
        inputKey: normalized.saveAs,
        ...bilingualMapPassthrough(normalized, "questions"),
        ...(normalized.questions && typeof normalized.questions === "object"
          ? { prompts: normalized.questions }
          : {}),
      });
    },
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "ask_question" ? normalizeAskQuestionNodeConfig({ ...config }) : null,
  });

  registerWorkflowNode({
    id: "date_picker",
    displayName: "Date Picker",
    description: "Ask the customer to choose a date using your business calendar rules.",
    category: "conversation",
    engineType: "action",
    icon: "CalendarPlus",
    accentClass: "from-teal-500/20 to-teal-500/5 border-teal-500/30",
    searchKeywords: ["date", "calendar", "picker", "appointment", "holiday"],
    defaultConfig: createDefaultDatePickerConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <MessageFieldEditor
          {...props}
          mapKey="prompts"
          baseField="prompt"
          alternateMapKeys={["questions", "messages"]}
          alternateBaseFields={["question", "message"]}
          arabicLabelKey="workflowBuilder.fields.promptArabic"
          englishLabelKey="workflowBuilder.fields.promptEnglish"
          arabicPlaceholderKey="workflowBuilder.fields.promptArabicPlaceholder"
          englishPlaceholderKey="workflowBuilder.fields.promptEnglishPlaceholder"
        />
        <DatePickerOptionsEditor {...props} />
      </div>
    ),
    validate: (config, nodeId) => validateDatePickerNodeConfig(config, nodeId),
    toEngineConfig: (config) => {
      const normalized = normalizeDatePickerNodeConfig(config);
      return withBuilderType("date_picker", {
        action: "pick_date",
        prompt: normalized.prompt,
        inputKey: normalized.saveAs,
        saveAs: normalized.saveAs,
        disablePastDates: normalized.disablePastDates,
        disableCompanyHolidays: normalized.disableCompanyHolidays,
        holidayBehavior: normalized.holidayBehavior,
        disableClosedWeekdays: normalized.disableClosedWeekdays,
        branchId: normalized.branchId,
        ...bilingualMapPassthrough(normalized, "prompts"),
      });
    },
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "date_picker" ? normalizeDatePickerNodeConfig({ ...config }) : null,
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
    defaultConfig: createDefaultWaitForReplyConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <WaitForReplyEditor {...props} />,
    validate: (config, nodeId) => requiredTextIssue("saveAs", "replySaveAs", nodeId, config),
    toEngineConfig: (config) => {
      const normalized = normalizeWaitForReplyNodeConfig(config);
      return withBuilderType("wait_for_reply", {
        action: "wait_for_reply",
        prompt: normalized.prompt,
        inputKey: normalized.saveAs,
        ...bilingualMapPassthrough(normalized, "prompts"),
      });
    },
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "wait_for_reply" ? normalizeWaitForReplyNodeConfig({ ...config }) : null,
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
      message: "",
      messages: {
        ar: "",
        en: "",
      },
      buttons: [],
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => <RichButtonListEditor {...props} />,
    validate: (config, nodeId) => {
      const issues: ValidationIssue[] = [];
      if (!hasBilingualOrLegacyMessage(config)) {
        issues.push(...requiredTextIssue("message", "message", nodeId, config));
      }
      const buttons = Array.isArray(config.buttons) ? config.buttons : [];
      if (buttons.filter((button) => buttonHasAnyLabel(button)).length === 0) {
        issues.push({
          id: `${nodeId}-buttons`,
          nodeId,
          message: "Add at least one button label before publishing.",
          severity: "error",
        });
      }
      if (buttons.length > 3) {
        issues.push({
          id: `${nodeId}-buttons-whatsapp-limit`,
          nodeId,
          message: "WhatsApp only sends the first 3 buttons. Use a List node for more options.",
          severity: "warning",
        });
      }
      return issues;
    },
    toEngineConfig: (config) =>
      withBuilderType("buttons", {
        action: "send_buttons",
        message: config.message,
        ...(config.messages && typeof config.messages === "object" ? { messages: config.messages } : {}),
        buttons: config.buttons,
        ...(config.primaryMenu === true ? { primaryMenu: true } : {}),
      }),
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
      title: "اختر خدمة",
      body: "اختَر الخيار الأنسب لك.",
      buttonLabel: "عرض الخيارات",
      titles: {
        ar: "اختر خدمة",
        en: "Choose a service",
      },
      bodies: {
        ar: "اختَر الخيار الأنسب لك.",
        en: "Pick the option that fits you best.",
      },
      buttonLabels: {
        ar: "عرض الخيارات",
        en: "View options",
      },
      rows: [
        {
          id: "1",
          title: "الخيار 1",
          titleAr: "الخيار 1",
          titleEn: "Option 1",
          description: "",
        },
      ],
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <PrimaryMenuToggle {...props} />
        <MessageFieldEditor
          {...props}
          mapKey="titles"
          baseField="title"
          arabicLabelKey="workflowBuilder.fields.titleArabic"
          englishLabelKey="workflowBuilder.fields.titleEnglish"
          arabicPlaceholderKey="workflowBuilder.fields.titleArabicPlaceholder"
          englishPlaceholderKey="workflowBuilder.fields.titleEnglishPlaceholder"
          compact
          showHint
        />
        <MessageFieldEditor
          {...props}
          mapKey="bodies"
          baseField="body"
          arabicLabelKey="workflowBuilder.fields.bodyArabic"
          englishLabelKey="workflowBuilder.fields.bodyEnglish"
          arabicPlaceholderKey="workflowBuilder.fields.bodyArabicPlaceholder"
          englishPlaceholderKey="workflowBuilder.fields.bodyEnglishPlaceholder"
          showHint={false}
        />
        <MessageFieldEditor
          {...props}
          mapKey="buttonLabels"
          baseField="buttonLabel"
          arabicLabelKey="workflowBuilder.fields.menuButtonArabic"
          englishLabelKey="workflowBuilder.fields.menuButtonEnglish"
          arabicPlaceholderKey="workflowBuilder.fields.menuButtonArabicPlaceholder"
          englishPlaceholderKey="workflowBuilder.fields.menuButtonEnglishPlaceholder"
          compact
          showHint={false}
        />
        <ListOptionsEditor {...props} />
        <ListVariableBindingEditor {...props} />
      </div>
    ),
    validate: (config, nodeId) => {
      const issues: ValidationIssue[] = [];
      if (!hasBilingualOrLegacyText(config, "titles", "title")) {
        issues.push(...requiredTextIssue("title", "title", nodeId, config));
      }
      if (!hasBilingualOrLegacyText(config, "bodies", "body")) {
        issues.push(...requiredTextIssue("body", "body", nodeId, config));
      }
      issues.push(...validateListVariableBinding(config, nodeId), ...validateListNodeOptions(config, nodeId));
      return issues;
    },
    toEngineConfig: (config) => {
      const normalized = normalizeListNodeConfig(config);
      const saveAs = typeof normalized.saveAs === "string" ? normalized.saveAs.trim() : "";
      const shared = {
        action: "send_list",
        title: config.title,
        body: config.body,
        buttonLabel: config.buttonLabel,
        ...bilingualMapPassthrough(config, "titles"),
        ...bilingualMapPassthrough(config, "bodies"),
        ...bilingualMapPassthrough(config, "buttonLabels"),
        ...(config.primaryMenu === true ? { primaryMenu: true } : {}),
        ...(saveAs ? { inputKey: saveAs, saveAs } : {}),
      };

      if (readListDataSourceMode(normalized) === "lookup") {
        const lookup = readListLookupConfig(normalized);
        const outputVariable = resolveLookupOutputVariableName(normalized);
        return withBuilderType("list", {
          ...shared,
          mode: "lookup",
          lookup: lookup?.lookup,
          displayField: lookup?.displayField,
          valueField: lookup?.valueField,
          filters: lookup?.filters ?? {},
          ...(outputVariable
            ? { outputVariable, inputKey: outputVariable, saveAs: outputVariable }
            : {}),
        });
      }

      return withBuilderType("list", {
        ...shared,
        mode: "manual",
        sections: [{ title: "Options", rows: config.rows }],
      });
    },
    fromEngineConfig: (_engineType, config) => {
      if (config.builderType !== "list") return null;
      const sections = Array.isArray(config.sections) ? config.sections : [];
      const sectionRows = sections[0] && typeof sections[0] === "object" && Array.isArray((sections[0] as { rows?: unknown }).rows)
        ? (sections[0] as { rows: unknown[] }).rows
        : config.rows;
      const mode = config.mode === "lookup" || config.optionsSource === "lookup" ? "lookup" : "manual";
      return normalizeListNodeConfig({
        ...config,
        mode,
        rows: sectionRows,
        lookup: config.lookup,
        displayField: config.displayField,
        valueField: config.valueField,
        filters: config.filters,
        saveAs: config.saveAs ?? config.inputKey ?? "",
      });
    },
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
        nodeId={props.context?.nodeId}
        document={props.context?.document}
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
    id: "return_to_main_menu",
    displayName: "Return to Main Menu",
    description: "Show the main menu again without restarting the conversation.",
    category: "conversation",
    engineType: "action",
    icon: "RotateCcw",
    accentClass: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
    searchKeywords: ["menu", "return", "main menu", "back", "options"],
    defaultConfig: { label: "Return to main menu" },
    allowIncoming: true,
    allowOutgoing: false,
    PropertyEditor: () => <EmptyProperties labelKey="return_to_main_menu" />,
    validate: () => [],
    toEngineConfig: (config) =>
      withBuilderType("return_to_main_menu", {
        action: "return_to_main_menu",
        label: config.label,
      }),
    fromEngineConfig: matchBuilderType("return_to_main_menu"),
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
    defaultConfig: { nameField: "customer_name", emailField: "", phoneField: "", ageField: "", genderField: "" },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="nameField" field="nameField" placeholder="customer_name" />
        <TextFieldEditor {...props} labelKey="emailField" field="emailField" />
        <TextFieldEditor {...props} labelKey="phoneField" field="phoneField" />
        <TextFieldEditor {...props} labelKey="ageField" field="ageField" />
        <TextFieldEditor {...props} labelKey="genderField" field="genderField" />
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
    id: "find_customer",
    displayName: "Find Customer",
    description: "Look up a customer by phone, email, or customer ID.",
    category: "crm",
    engineType: "action",
    icon: "UserSearch",
    accentClass: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    searchKeywords: ["find customer", "lookup customer", "customer", "crm", "search"],
    defaultConfig: createDefaultFindCustomerNodeConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: FindCustomerPropertyEditor,
    validate: validateFindCustomerConfig,
    toEngineConfig: (config) =>
      withBuilderType("find_customer", { action: "find_customer", ...normalizeFindCustomerNodeConfig(config) }),
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "find_customer"
        ? normalizeFindCustomerNodeConfig({ ...config })
        : null,
  });

  registerWorkflowNode({
    id: "create_booking",
    displayName: "Create Booking",
    description: "Create an appointment booking.",
    category: "crm",
    engineType: "action",
    icon: "CalendarPlus",
    accentClass: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
    defaultConfig: createDefaultCreateBookingConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: CreateBookingPropertyEditor,
    validate: validateCreateBookingConfig,
    toEngineConfig: (config) =>
      withBuilderType("create_booking", { action: "create_booking", ...normalizeCreateBookingNodeConfig(config) }),
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "create_booking"
        ? normalizeCreateBookingNodeConfig({ ...config })
        : null,
  });

  registerWorkflowNode({
    id: "create_ticket",
    displayName: "Create Ticket",
    description: "Open a support ticket from the conversation.",
    category: "crm",
    engineType: "action",
    icon: "Ticket",
    accentClass: "from-rose-500/20 to-rose-500/5 border-rose-500/30",
    searchKeywords: ["ticket", "support", "create ticket", "issue"],
    defaultConfig: createDefaultCreateTicketConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: CreateTicketPropertyEditor,
    validate: validateCreateTicketConfig,
    toEngineConfig: (config) =>
      withBuilderType("create_ticket", { action: "create_ticket", ...normalizeCreateTicketNodeConfig(config) }),
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "create_ticket" || config.action === "create_ticket"
        ? normalizeCreateTicketNodeConfig({ ...config })
        : null,
  });

  registerWorkflowNode({
    id: "find_ticket",
    displayName: "Find Ticket",
    description: "Look up a support ticket by number and expose its details.",
    category: "crm",
    engineType: "action",
    icon: "UserSearch",
    accentClass: "from-rose-500/20 to-rose-500/5 border-rose-500/30",
    searchKeywords: ["ticket", "find ticket", "lookup ticket", "complaint number", "ticket number"],
    defaultConfig: createDefaultFindTicketConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: FindTicketPropertyEditor,
    validate: validateFindTicketConfig,
    toEngineConfig: (config) =>
      withBuilderType("find_ticket", { action: "find_ticket", ...normalizeFindTicketNodeConfig(config) }),
    fromEngineConfig: (_engineType, config) =>
      config.builderType === "find_ticket" || config.action === "find_ticket"
        ? normalizeFindTicketNodeConfig({ ...config })
        : null,
  });

  registerWorkflowNode({
    id: "assign_ticket",
    displayName: "Assign Ticket",
    description: "Assign a support ticket to a team member.",
    category: "crm",
    engineType: "action",
    icon: "UserCheck",
    accentClass: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/30",
    searchKeywords: ["assign ticket", "ticket", "assignee", "support"],
    defaultConfig: {
      ticketIdField: "ticket_id",
      assigneeUserIdField: "",
      assigneeNameField: "assignee_name",
      ticketId: "",
      assigneeUserId: "",
      assigneeName: "",
    },
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: (props) => (
      <div className="space-y-4">
        <TextFieldEditor {...props} labelKey="ticketId" field="ticketId" placeholder="Optional static ticket id" />
        <TextFieldEditor {...props} labelKey="ticketIdField" field="ticketIdField" placeholder="ticket_id" />
        <TextFieldEditor {...props} labelKey="assigneeUserId" field="assigneeUserId" />
        <TextFieldEditor {...props} labelKey="assigneeUserIdField" field="assigneeUserIdField" />
        <TextFieldEditor {...props} labelKey="assigneeName" field="assigneeName" />
        <TextFieldEditor {...props} labelKey="assigneeNameField" field="assigneeNameField" placeholder="assignee_name" />
      </div>
    ),
    validate: () => [],
    toEngineConfig: (config) => withBuilderType("assign_ticket", { action: "assign_ticket", ...config }),
    fromEngineConfig: matchBuilderType("assign_ticket"),
  });

  registerAIWorkflowNodes();
  registerAIExtractWorkflowNode();
  registerAIDecisionWorkflowNode();
  registerAIKnowledgeSearchWorkflowNode();
}
