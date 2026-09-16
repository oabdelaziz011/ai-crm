import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLlmEmailRoutingClassifier,
  type EmailRoutingChatGateway,
  type EmailRoutingChatRequest,
} from "./index.js";

function mockGateway(handler: (input: EmailRoutingChatRequest) => Promise<{ text: string }> | { text: string }): {
  gateway: EmailRoutingChatGateway;
  calls: EmailRoutingChatRequest[];
} {
  const calls: EmailRoutingChatRequest[] = [];
  return {
    calls,
    gateway: {
      async chatCompletion(input) {
        calls.push(input);
        return handler(input);
      },
    },
  };
}

function jsonResponse(payload: Record<string, unknown>): { text: string } {
  return { text: JSON.stringify(payload) };
}

describe("LlmEmailRoutingClassifier (Sprint 2)", () => {
  it("classifies sales from subject/body via LLM", async () => {
    const { gateway, calls } = mockGateway(() =>
      jsonResponse({
        category: "sales",
        confidence: 0.91,
        reason: "Pricing/demo request",
        subcategory: null,
      }),
    );
    const classifier = createLlmEmailRoutingClassifier(gateway);
    const result = await classifier.classify({
      subject: "Demo request",
      body: "Interested in purchasing enterprise pricing.",
      companyId: "co-1",
    });
    assert.equal(result.category, "sales");
    assert.equal(result.confidence, 0.91);
    assert.equal(result.source, "llm");
    assert.match(calls[0]!.messages.map((m) => m.content).join("\n"), /Subject:/);
    assert.match(calls[0]!.messages.map((m) => m.content).join("\n"), /Body:/);
    assert.equal(calls[0]!.metadata?.response_format, "json");
  });

  it("classifies support", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "support", confidence: 0.88, reason: "Login error" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Cannot login",
      body: "Need technical help with an error message.",
    });
    assert.equal(result.category, "support");
  });

  it("classifies billing", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "billing", confidence: 0.86, reason: "Invoice issue" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Invoice",
      body: "We were double charged on our last payment.",
    });
    assert.equal(result.category, "billing");
  });

  it("classifies complaint", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "complaint", confidence: 0.93, reason: "Formal complaint" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Complaint",
      body: "This is unacceptable. Filing a formal complaint.",
    });
    assert.equal(result.category, "complaint");
  });

  it("classifies hr", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "hr", confidence: 0.84, reason: "Job application" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Job application",
      body: "Please find my resume for the open role.",
    });
    assert.equal(result.category, "hr");
  });

  it("classifies general inquiry", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "general_inquiry", confidence: 0.4, reason: "Greeting only" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Hello",
      body: "Hope you are well.",
    });
    assert.equal(result.category, "general_inquiry");
  });

  it("includes subject so it can materially affect classification", async () => {
    const { gateway, calls } = mockGateway(() =>
      jsonResponse({ category: "billing", confidence: 0.9, reason: "Subject indicates invoice" }),
    );
    await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Invoice overdue - payment failed",
      body: "Please look into this soon.",
    });
    const user = calls[0]!.messages.find((m) => m.role === "user")?.content ?? "";
    assert.match(user, /Invoice overdue - payment failed/);
    assert.match(user, /Please look into this soon/);
  });

  it("maps unsupported model category to safe general_inquiry", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "marketing", confidence: 0.99, reason: "Promo" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Promo",
      body: "Buy now",
    });
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.source, "llm");
    assert.match(result.reason, /Unsupported category/i);
  });

  it("maps invalid confidence to safe result", async () => {
    const { gateway } = mockGateway(() =>
      jsonResponse({ category: "sales", confidence: 1.5, reason: "Bad confidence" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Quote",
      body: "Need pricing",
    });
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.source, "llm");
    assert.match(result.reason, /Invalid confidence/i);
  });

  it("maps provider failure to safe result", async () => {
    const { gateway } = mockGateway(async () => {
      throw new Error("upstream timeout");
    });
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Help",
      body: "Something broke",
    });
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.source, "llm");
    assert.match(result.reason, /failed/i);
  });

  it("maps malformed provider response to safe result", async () => {
    const { gateway } = mockGateway(() => ({ text: "not-json-at-all" }));
    const result = await createLlmEmailRoutingClassifier(gateway).classify({
      subject: "Hi",
      body: "Just checking in",
    });
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.source, "llm");
    assert.match(result.reason, /Malformed/i);
  });

  it("does not log the email body", async () => {
    const logs: unknown[] = [];
    const originalInfo = console.info;
    const originalLog = console.log;
    const originalError = console.error;
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      const secretBody = "SECRET_EMAIL_BODY_DO_NOT_LOG_XYZ";
      const { gateway } = mockGateway(() =>
        jsonResponse({ category: "support", confidence: 0.8, reason: "ok" }),
      );
      await createLlmEmailRoutingClassifier(gateway).classify({
        subject: "Support",
        body: secretBody,
      });
      const serialized = JSON.stringify(logs);
      assert.equal(serialized.includes(secretBody), false);
    } finally {
      console.info = originalInfo;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it("injects Platform AI runtime apiKey into gateway metadata (server-side only)", async () => {
    const { gateway, calls } = mockGateway(() =>
      jsonResponse({ category: "billing", confidence: 0.9, reason: "invoice" }),
    );
    const secretKey = "sk-test-runtime-key-never-return";
    const result = await createLlmEmailRoutingClassifier(gateway, {
      resolveRuntimeConfig: async ({ companyId, providerKey, useCase }) => {
        assert.equal(companyId, "co-runtime");
        assert.equal(providerKey, "openai");
        assert.equal(useCase, "chat");
        return {
          apiKey: secretKey,
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
          providerKey: "openai",
          usesPlatformKey: true,
        };
      },
    }).classify({
      subject: "Invoice",
      body: "Please send the latest invoice.",
      companyId: "co-runtime",
    });

    assert.equal(result.category, "billing");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.metadata?.apiKey, secretKey);
    assert.equal(calls[0]!.metadata?.companyId, "co-runtime");
    assert.equal(calls[0]!.metadata?.response_format, "json");
    assert.equal(calls[0]!.metadata?.model, "gpt-4o-mini");
    assert.equal(calls[0]!.model, "gpt-4o-mini");
    assert.equal(calls[0]!.providerKey, "openai");
    // Classification result must never echo the secret.
    assert.equal(JSON.stringify(result).includes(secretKey), false);
  });

  it("respects explicit classifier model over runtime model", async () => {
    const { gateway, calls } = mockGateway(() =>
      jsonResponse({ category: "support", confidence: 0.85, reason: "help" }),
    );
    await createLlmEmailRoutingClassifier(gateway, {
      model: "gpt-4o",
      resolveRuntimeConfig: async () => ({
        apiKey: "sk-runtime",
        model: "gpt-4o-mini",
        providerKey: "openai",
      }),
    }).classify({
      subject: "Help",
      body: "Need support",
      companyId: "co-1",
    });
    assert.equal(calls[0]!.model, "gpt-4o");
    assert.equal(calls[0]!.metadata?.apiKey, "sk-runtime");
    assert.equal(calls[0]!.metadata?.companyId, "co-1");
  });

  it("fails safely when runtime resolver throws (missing key path)", async () => {
    const { gateway, calls } = mockGateway(() =>
      jsonResponse({ category: "sales", confidence: 0.99, reason: "should not run" }),
    );
    const result = await createLlmEmailRoutingClassifier(gateway, {
      resolveRuntimeConfig: async () => {
        throw new Error(
          "OpenAI API key is required. Configure configuration.apiKey on the company provider connection.",
        );
      },
    }).classify({
      subject: "Demo",
      body: "Pricing please",
      companyId: "co-missing-key",
    });
    assert.equal(calls.length, 0);
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.confidence, 0.12);
    assert.match(result.reason, /LLM classification failed/);
    assert.match(result.reason, /OpenAI API key is required/);
  });

  it("fails safely when gateway rejects missing apiKey after empty runtime", async () => {
    const { gateway, calls } = mockGateway(async () => {
      throw new Error(
        "OpenAI API key is required. Configure configuration.apiKey on the company provider connection.",
      );
    });
    const result = await createLlmEmailRoutingClassifier(gateway, {
      resolveRuntimeConfig: async () => ({ providerKey: "openai", model: "gpt-4o-mini" }),
    }).classify({
      subject: "Hello",
      body: "General question",
      companyId: "co-empty-key",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.metadata?.companyId, "co-empty-key");
    assert.equal(calls[0]!.metadata?.apiKey, undefined);
    assert.equal(result.category, "general_inquiry");
    assert.equal(result.confidence, 0.12);
  });
});
