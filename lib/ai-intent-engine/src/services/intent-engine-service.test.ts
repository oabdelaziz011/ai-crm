import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultCompositeClassifier } from "../classifiers/composite-classifier.js";
import { RuleBasedClassifier } from "../classifiers/rule-based-classifier.js";
import { PermissionDeniedError } from "../errors.js";
import type { ConversationReader } from "../ports/conversation-reader.js";
import type { IntentDefinitionRepository, IntentMatchRepository } from "../repositories/intent-repositories.js";
import { IntentEngineService } from "./intent-engine-service.js";
import { IntentMatchingService } from "./intent-matching-service.js";
import type {
  IntentDefinitionRecord,
  IntentMatchRecord,
  ServiceContext,
} from "../types.js";

const fallbackIntent: IntentDefinitionRecord = {
  id: "intent-fallback",
  key: "fallback",
  display_name: "Fallback",
  description: "Fallback intent",
  category: "system",
  priority: 10,
  confidence_threshold: 0,
  required_states: [],
  required_permissions: ["intents.view"],
  matched_tool_key: null,
  classification_rules: {},
  requires_human: false,
  requires_llm: true,
  is_enabled: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const faqIntent: IntentDefinitionRecord = {
  id: "intent-faq",
  key: "faq",
  display_name: "FAQ",
  description: "FAQ intent",
  category: "knowledge",
  priority: 150,
  confidence_threshold: 0.6,
  required_states: ["greeting", "waiting_user", "waiting_api"],
  required_permissions: ["intents.view"],
  matched_tool_key: "faq",
  classification_rules: {
    keywords: ["hours", "pricing"],
    phrases: ["what are your hours"],
    baseConfidence: 0.78,
  },
  requires_human: false,
  requires_llm: false,
  is_enabled: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const bookingIntent: IntentDefinitionRecord = {
  id: "intent-booking",
  key: "booking_request",
  display_name: "Booking Request",
  description: "Booking intent",
  category: "scheduling",
  priority: 180,
  confidence_threshold: 0.65,
  required_states: ["collecting_information", "waiting_user", "waiting_api"],
  required_permissions: ["intents.view", "tools.execute"],
  matched_tool_key: "booking",
  classification_rules: {
    keywords: ["book", "schedule"],
    phrases: ["book an appointment"],
    baseConfidence: 0.86,
  },
  requires_human: false,
  requires_llm: false,
  is_enabled: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const escalationIntent: IntentDefinitionRecord = {
  id: "intent-escalation",
  key: "escalation_request",
  display_name: "Escalation Request",
  description: "Escalation intent",
  category: "control",
  priority: 190,
  confidence_threshold: 0.58,
  required_states: ["greeting", "collecting_information", "waiting_user", "waiting_api"],
  required_permissions: ["intents.view", "tools.execute", "ai.conversations.takeover"],
  matched_tool_key: "escalation",
  classification_rules: {
    keywords: ["human", "agent"],
    phrases: ["speak to a human"],
    baseConfidence: 0.88,
  },
  requires_human: true,
  requires_llm: false,
  is_enabled: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const weakIntent: IntentDefinitionRecord = {
  id: "intent-weak",
  key: "knowledge_lookup",
  display_name: "Knowledge Lookup",
  description: "Weak match intent",
  category: "knowledge",
  priority: 120,
  confidence_threshold: 0.9,
  required_states: ["waiting_user"],
  required_permissions: ["intents.view"],
  matched_tool_key: "knowledge_lookup",
  classification_rules: {
    keywords: ["docs"],
    baseConfidence: 0.55,
  },
  requires_human: false,
  requires_llm: false,
  is_enabled: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "intents.view" || code === "tools.execute" || code === "ai.conversations.takeover",
    ...overrides,
  };
}

function createStores(options?: {
  conversationState?: IntentDefinitionRecord["required_states"][number];
  intents?: IntentDefinitionRecord[];
}) {
  const intents = options?.intents ?? [fallbackIntent, faqIntent, bookingIntent, escalationIntent, weakIntent];
  const matches: IntentMatchRecord[] = [];

  const definitionRepository: IntentDefinitionRepository = {
    listEnabled: async () => intents.filter((intent) => intent.is_enabled),
    listAll: async () => intents,
    findById: async (id) => intents.find((intent) => intent.id === id) ?? null,
    findByKey: async (key) => intents.find((intent) => intent.key === key) ?? null,
    updateEnabled: async (input) => {
      const intent = intents.find((item) => item.id === input.intentId);
      if (!intent) throw new Error("Intent not found");
      intent.is_enabled = input.isEnabled;
      return intent;
    },
  };

  const matchRepository: IntentMatchRepository = {
    create: async (input) => {
      const record: IntentMatchRecord = {
        id: `match-${matches.length + 1}`,
        company_id: input.companyId,
        conversation_id: input.conversationId,
        intent_definition_id: input.intentDefinitionId,
        intent_key: input.intentKey,
        classifier_key: input.classifierKey,
        message_preview: input.messagePreview,
        confidence: input.confidence,
        matched_tool_key: input.matchedToolKey,
        reason: input.reason,
        alternatives: input.alternatives,
        requires_human: input.requiresHuman,
        requires_llm: input.requiresLlm,
        status: input.status,
        created_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      matches.push(record);
      return record;
    },
    findById: async (id) => matches.find((match) => match.id === id) ?? null,
    list: async () => matches,
  };

  const conversationReader: ConversationReader = {
    findById: async (conversationId) => ({
      id: conversationId,
      company_id: "company-1",
      state: options?.conversationState ?? "waiting_user",
    }),
  };

  const classifier = createDefaultCompositeClassifier();
  const matchingService = new IntentMatchingService(definitionRepository, classifier);
  const engine = new IntentEngineService(
    definitionRepository,
    matchRepository,
    conversationReader,
    matchingService,
  );

  return { engine, matchingService, matches, classifier };
}

describe("RuleBasedClassifier", () => {
  it("matches high-confidence FAQ messages", async () => {
    const classifier = new RuleBasedClassifier();
    const candidates = await classifier.classify(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        messageText: "What are your hours today?",
      },
      [faqIntent],
    );

    assert.ok(candidates.length > 0);
    assert.equal(candidates[0]?.intentKey, "faq");
    assert.ok((candidates[0]?.confidence ?? 0) >= 0.78);
  });
});

describe("CompositeClassifier", () => {
  it("selects only the rule-based classifier in Sprint 2.5", () => {
    const classifier = createDefaultCompositeClassifier();
    assert.deepEqual(classifier.getActiveClassifierKeys(), ["rule_based"]);
  });
});

describe("IntentEngineService", () => {
  it("returns a high-confidence matched routing decision", async () => {
    const { engine, matches } = createStores({ conversationState: "waiting_user" });

    const result = await engine.resolve(createContext(), {
      conversationId: "conv-1",
      messageText: "What are your hours?",
    });

    assert.equal(result.status, "matched");
    assert.equal(result.intent_key, "faq");
    assert.equal(result.matched_tool, "faq");
    assert.ok(result.confidence >= 0.6);
    assert.equal(result.classifier_key, "rule_based");
    assert.equal(matches.length, 1);
  });

  it("falls back when confidence is below threshold", async () => {
    const { engine } = createStores({ conversationState: "waiting_user" });

    const result = await engine.resolve(createContext(), {
      conversationId: "conv-1",
      messageText: "Can you share docs?",
    });

    assert.equal(result.status, "fallback");
    assert.equal(result.intent_key, "fallback");
    assert.equal(result.matched_tool, null);
    assert.equal(result.requires_llm, true);
  });

  it("rejects routing when permissions are missing", async () => {
    const { engine } = createStores({ conversationState: "collecting_information" });

    const result = await engine.resolve(
      createContext({ hasPermission: (code) => code === "intents.view" }),
      {
        conversationId: "conv-1",
        messageText: "Book an appointment tomorrow",
      },
    );

    assert.equal(result.status, "rejected");
    assert.equal(result.intent_key, "booking_request");
    assert.equal(result.matched_tool, "booking");
    assert.match(result.reason, /permission/i);
  });

  it("falls back for unsupported conversation states", async () => {
    const { engine } = createStores({ conversationState: "greeting" });

    const result = await engine.resolve(createContext(), {
      conversationId: "conv-1",
      messageText: "Book an appointment tomorrow",
    });

    assert.equal(result.status, "fallback");
    assert.equal(result.intent_key, "fallback");
    assert.match(result.reason, /not supported in state/i);
  });

  it("escalates human-handoff intents", async () => {
    const { engine } = createStores({ conversationState: "waiting_user" });

    const result = await engine.resolve(createContext(), {
      conversationId: "conv-1",
      messageText: "I need to speak to a human please",
    });

    assert.equal(result.status, "escalated");
    assert.equal(result.intent_key, "escalation_request");
    assert.equal(result.matched_tool, "escalation");
    assert.equal(result.requires_human, true);
  });

  it("throws when intents.view permission is missing", async () => {
    const { engine } = createStores();

    await assert.rejects(
      () =>
        engine.resolve(createContext({ hasPermission: () => false }), {
          conversationId: "conv-1",
          messageText: "hello",
        }),
      PermissionDeniedError,
    );
  });
});

describe("IntentMatchingService", () => {
  it("returns alternatives for competing candidates", async () => {
    const { matchingService } = createStores({ conversationState: "waiting_user" });
    const candidates = await matchingService.classifyMessage({
      companyId: "company-1",
      conversationId: "conv-1",
      conversationState: "waiting_user",
      messageText: "What are your hours?",
    });

    const evaluation = matchingService.evaluateCandidates(
      createContext(),
      "waiting_user",
      candidates,
      [fallbackIntent, faqIntent, bookingIntent],
      fallbackIntent,
    );

    assert.equal(evaluation.status, "matched");
    assert.equal(evaluation.selected?.key, "faq");
  });
});
