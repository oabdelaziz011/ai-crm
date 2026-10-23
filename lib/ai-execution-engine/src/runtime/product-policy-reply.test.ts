import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";
import { ToolCallLoopService } from "./tool-call-loop-service.js";

const ctx = { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true };

const software = {
  productId: "p-1",
  name: "فاليواور سوفتوير سوليوشن",
  sku: "PRD-DSUD",
  productType: "service",
  category: { id: "c-1", name: "سوفتوير" },
  summary: "منصة تشغيل للعيادات",
  description: "منصة تشغيل للعيادات والمستشفيات",
  price: { status: "listed", amount: 1200, currency: "EGP" },
  imageCount: 2,
  deliveryImages: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
};

function loop(products: Array<Record<string, unknown>>) {
  const queries: string[] = [];
  const limits: number[] = [];
  const gateway: RuntimeGatewayPort = {
    async chatCompletion() {
      throw new Error("product and policy replies must not call the model");
    },
  };
  const tools = {
    allowedToolKeys: () => ["search_products", "get_product_details", "create_booking"],
    route: async (
      _ctx: unknown,
      request: {
        toolKey: string;
        input?: { query?: string; productType?: string; limit?: number; productIds?: string[] };
      },
    ) => {
      if (request.toolKey === "get_product_details") {
        const ids = request.input?.productIds ?? [];
        const detailed = products.filter((row) => ids.includes(String(row.productId ?? "")));
        const first = detailed[0];
        const deliveryImages = Array.isArray(first?.deliveryImages)
          ? first.deliveryImages.filter((url): url is string => typeof url === "string")
          : [];
        return {
          toolKey: request.toolKey,
          executionId: "exec-product-details",
          status: "succeeded" as const,
          durationMs: 1,
          output: {
            success: true,
            products: detailed,
            ...(deliveryImages.length === 1 || detailed.length === 1
              ? {
                  deliveryImages: deliveryImages.slice(0, 5),
                  deliveryCaption: typeof first?.name === "string" ? first.name : undefined,
                }
              : {}),
          },
        };
      }
      queries.push(request.input?.query ?? "");
      limits.push(typeof request.input?.limit === "number" ? request.input.limit : -1);
      const type = request.input?.productType?.trim() || null;
      const filtered = type
        ? products.filter((row) => String(row.productType ?? "") === type)
        : products;
      return {
        toolKey: request.toolKey,
        executionId: "exec-products",
        status: "succeeded" as const,
        durationMs: 1,
        output: { success: true, found: filtered.length > 0, products: filtered },
      };
    },
  };
  return {
    queries,
    limits,
    service: new ToolCallLoopService({ gateway, tools }),
  };
}

async function ask(
  text: string,
  products = [software],
  system = "",
  prior: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
) {
  const { service, queries, limits } = loop(products);
  const result = await service.run({
    ctx,
    conversationId: "conversation-products",
    gatewayRequest: {
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        ...prior,
        { role: "user" as const, content: text },
      ],
      providerKey: "mock",
      model: "mock-gpt",
      context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
    },
    tools: [
      { type: "function", function: { name: "search_products" } },
      { type: "function", function: { name: "get_product_details" } },
    ],
    allowedToolKeys: ["search_products", "get_product_details", "create_booking"],
  });
  return { text: result.response.text, queries, limits, toolExecutions: result.toolExecutions };
}

describe("product and policy replies", () => {
  it("keeps a named SKU when a nearby type word would filter it out", async () => {
    const clinic = {
      productId: "c46587f5-0000-4000-8000-000000000001",
      name: "ValueOR Clinic Management",
      sku: "VALUEOR-CLIN-90JR",
      productType: "subscription",
      summary: "إدارة العيادات",
      price: { status: "listed", amount: 499.9, currency: "EGP", taxIncluded: true },
    };
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("a catalog hit must not fall through to the model");
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_products", "get_product_details"],
      route: async (
        _ctx: unknown,
        request: { toolKey: string; input?: { query?: string; productType?: string; productIds?: string[] } },
      ) => {
        if (request.toolKey === "get_product_details") {
          return {
            toolKey: request.toolKey,
            executionId: "exec-details",
            status: "succeeded" as const,
            durationMs: 1,
            output: { success: true, products: [clinic] },
          };
        }
        return {
          toolKey: request.toolKey,
          executionId: "exec-search",
          status: "succeeded" as const,
          durationMs: 1,
          output: {
            success: true,
            found: true,
            products: [clinic],
            recommendation: { action: "no_match", products: [], customerText: "مفيش منتج نشط" },
          },
        };
      },
    };
    const service = new ToolCallLoopService({ gateway, tools });
    const cases = [
      {
        text: "عايز أعرف الخدمات المتاحة. كود المنتج VALUEOR-CLIN-90JR. متقوليش سعر من عندك.",
        pattern: /499\.9/,
      },
      {
        text: "What services do you have? Product code VALUEOR-CLIN-90JR. Do not invent a price.",
        pattern: /499\.9/,
      },
      {
        text: "Welche Dienstleistungen gibt es? Produktcode VALUEOR-CLIN-90JR. Erfinde keinen Preis.",
        pattern: /499\.9/,
      },
    ];
    for (const sample of cases) {
      const result = await service.run({
        ctx,
        conversationId: "conversation-products",
        gatewayRequest: {
          messages: [{ role: "user", content: sample.text }],
          providerKey: "mock",
          model: "mock-gpt",
          context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
        },
        tools: [{ type: "function", function: { name: "search_products" } }],
        allowedToolKeys: ["search_products", "get_product_details"],
      });
      assert.match(result.response.text, /VALUEOR-CLIN-90JR/);
      assert.match(result.response.text, sample.pattern);
      assert.doesNotMatch(result.response.text, /مش لاقي المنتج|could not find that product|nicht gefunden/i);
    }
  });

  it("does not say a found product is missing when the recommendation text says no match", async () => {
    const clinic = {
      productId: "c46587f5-0000-4000-8000-000000000001",
      name: "ValueOR Clinic Management",
      sku: "VALUEOR-CLIN-90JR",
      productType: "subscription",
      summary: "إدارة العيادات",
      price: { status: "listed", amount: 499.9, currency: "EGP" },
    };
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("a catalog hit must not fall through to the model");
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_products", "get_product_details"],
      route: async () => ({
        toolKey: "search_products",
        executionId: "exec-search",
        status: "succeeded" as const,
        durationMs: 1,
        output: {
          success: true,
          found: true,
          products: [clinic],
          recommendation: {
            action: "no_match",
            products: [],
            customerText: "مفيش منتج نشط في كتالوج الشركة يطابق الطلب ده.",
          },
        },
      }),
    };
    const service = new ToolCallLoopService({ gateway, tools });
    const result = await service.run({
      ctx,
      conversationId: "conversation-products",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content:
              "عايز أشتري منتج عيادة. اسمي سارة اختبار. الإيميل sara.remediation@example.test والموبايل 01000000991. الميزانية 5000 جنيه.",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_products" } }],
      allowedToolKeys: ["search_products", "get_product_details"],
    });
    assert.match(result.response.text, /VALUEOR-CLIN-90JR/);
    assert.doesNotMatch(result.response.text, /مفيش منتج نشط|اتجاهين مختلفين|رقم التليفون/);
  });

  it("lists products by name and code when the customer asks what products exist", async () => {
    const result = await ask("المنتجات ايه ؟");
    assert.deepEqual(result.queries, [""]);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
  });

  it("lists the catalog for colloquial 'tell me about your products'", async () => {
    const result = await ask("ممكن تعرفني ع منتجاتكم", [
      software,
      {
        productId: "p-2",
        name: "Sprint Verify Widget",
        sku: "SVW-001",
        productType: "product",
        summary: "أداة تحقق",
        price: { status: "not_listed" },
      },
    ]);
    assert.deepEqual(result.queries, [""]);
    assert.match(result.text, /المنتجات المتاحة/);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
    assert.match(result.text, /Sprint Verify Widget \(SVW-001\)/);
    assert.doesNotMatch(result.text, /مش لاقي المنتج/);
  });

  it("lists the catalog for possessive 'منتجاتك' without refusing or pivoting to services", async () => {
    const result = await ask("ممكن تقولي منتجاتك ايه", [
      software,
      {
        productId: "p-2",
        name: "Sprint Verify Widget",
        sku: "SVW-001",
        productType: "product",
        summary: "أداة تحقق",
        price: { status: "not_listed" },
      },
    ]);
    assert.deepEqual(result.queries, [""]);
    assert.match(result.text, /المنتجات المتاحة/);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
    assert.doesNotMatch(result.text, /لا استطيع|لا أستطيع|الخدمات المتاحة عندنا|عن خدماتنا/);
  });

  it("lists products even when the gateway tool list is empty but the tool port is present", async () => {
    const { service, queries } = loop([software]);
    const result = await service.run({
      ctx,
      conversationId: "conversation-products",
      gatewayRequest: {
        messages: [{ role: "user", content: "ممكن تقولي منتجاتك ايه" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
      },
      tools: [],
      allowedToolKeys: ["search_products", "get_product_details"],
    });
    assert.deepEqual(queries, [""]);
    assert.match(result.response.text, /المنتجات المتاحة/);
    assert.match(result.response.text, /فاليواور سوفتوير سوليوشن/);
    assert.doesNotMatch(result.response.text, /لا استطيع|لا أستطيع|الخدمات المتاحة عندنا/);
  });

  it("does not invent scheduling services when catalog tools are not offered", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "للأسف لا استطيع عرض المنتجات بشكل مباشر لكنني يمكنني مساعدتك في معرفة الخدمات المتاحة مثل: كشف",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 1,
        };
      },
    };
    const service = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["create_booking"],
        route: async () => {
          throw new Error("catalog tools must not be called");
        },
      },
    });
    const result = await service.run({
      ctx,
      conversationId: "conversation-products",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content: "SCHEDULING CATALOG\n- service: كشف",
          },
          { role: "user", content: "ممكن تقولي منتجاتك ايه" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking"],
    });
    assert.match(result.response.text, /تعذّر تحميل/);
    assert.doesNotMatch(result.response.text, /لا استطيع|الخدمات المتاحة|كشف/);
  });

  it("lists the catalog for colloquial 'what products do you have' without treating filler as a name", async () => {
    const result = await ask("ايه المنتجات اللي عندك");
    assert.deepEqual(result.queries, [""]);
    assert.match(result.text, /المنتجات المتاحة/);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
    assert.doesNotMatch(result.text, /ملقتش منتج/);
  });

  it("lists only matching product types for service and real-estate questions", async () => {
    const villa = {
      productId: "p-re",
      name: "فيلا الساحل",
      sku: "RE-001",
      productType: "real_estate",
      category: { id: "c-re", name: "ساحلي" },
      summary: "فيلا على البحر",
      price: { status: "not_listed" },
    };
    const services = await ask("ايه الخدمات اللي عندك", [software, villa]);
    assert.match(services.text, /الخدمات المتاحة من الكتالوج/);
    assert.match(services.text, /فاليواور سوفتوير سوليوشن/);
    assert.doesNotMatch(services.text, /فيلا الساحل/);

    const estates = await ask("وريني العقارات", [software, villa]);
    assert.match(estates.text, /العقارات المتاحة/);
    assert.match(estates.text, /فيلا الساحل \(RE-001\)/);
    assert.doesNotMatch(estates.text, /فاليواور سوفتوير/);
  });

  it("finds a product from a descriptive word and shows its name and code", async () => {
    const result = await ask("عايز السوفتوير");
    assert.deepEqual(result.queries, ["سوفتوير"]);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن/);
    assert.match(result.text, /الرمز: PRD-DSUD/);
    assert.match(result.text, /النوع: خدمة/);
    assert.doesNotMatch(result.text, /السعر:|شامل الضريبة|1200 EGP/);
  });

  it("finds a product from its code", async () => {
    const result = await ask("PRD-DSUD");
    assert.match(result.text, /الرمز: PRD-DSUD/);
  });

  it("lists more than one catalog product when browsing", async () => {
    const second = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "PRD-WIDGET",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "not_listed" },
    };
    const result = await ask("ايه المنتجات اللي عندك", [software, second]);
    assert.equal(result.limits[0], 12);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
    assert.match(result.text, /Sprint Verify Widget \(PRD-WIDGET\)/);
  });

  it("returns the product description when the customer asks for details", async () => {
    const result = await ask("ممكن معلومات عنه", [software], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.doesNotMatch(result.text, /سعر فاليواور|السعر:|شامل الضريبة|1200 EGP/);
    assert.equal(
      result.toolExecutions.some(
        (row) => Array.isArray(row.output?.deliveryImages) && row.output.deliveryImages.length > 0,
      ),
      false,
    );
  });

  it("lists product titles when the customer asks for catalog details and waits for a pick", async () => {
    const second = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      description: "حل للتحقق من الهوية",
      price: { status: "not_listed" },
    };
    const result = await ask("عايز اعرف تفاصيل عن المنتجات", [software, second]);
    assert.match(result.text, /اختار المنتج اللي تحب تعرف تفاصيله/);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\)/);
    assert.match(result.text, /Sprint Verify Widget \(SVW-001\)/);
    assert.doesNotMatch(result.text, /الوصف:|السعر:|شامل الضريبة/);
  });

  it("lists remaining product titles when asked for the other products' details", async () => {
    const second = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      description: "حل للتحقق من الهوية",
      price: { status: "not_listed" },
    };
    const result = await ask("ممكن تفاصيل باقي المنتجات", [software, second], "", [
      {
        role: "assistant",
        content:
          "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة\nالفئة: سوفتوير\nالوصف: اختبار سيستم",
      },
    ]);
    assert.match(result.text, /اختار المنتج اللي تحب تعرف تفاصيله/);
    assert.match(result.text, /Sprint Verify Widget \(SVW-001\)/);
    assert.doesNotMatch(result.text, /الوصف: حل للتحقق/);
    assert.doesNotMatch(result.text, /فاليواور سوفتوير سوليوشن/);
    assert.doesNotMatch(result.text, /مش لاقي المنتج/);
  });

  it("answers company and services intro questions from knowledge without product lookup", async () => {
    const aboutCompany = await ask(
      "ممكن تعرفني اكتر عن شركتكم",
      [software],
      "Use the following company knowledge to answer accurately. Cite sources internally when referencing facts.\n[عن الشركة] عيادات النور تقدم رعاية متكاملة منذ 2010.",
    );
    assert.match(aboutCompany.text, /عن الشركة/);
    assert.match(aboutCompany.text, /عيادات النور/);
    assert.deepEqual(aboutCompany.queries, []);
    assert.doesNotMatch(aboutCompany.text, /مش لاقي المنتج|PRD-DSUD/);

    const aboutServices = await ask(
      "ممكن تعرفني عن خدماتكم",
      [software],
      "Use the following company knowledge to answer accurately. Cite sources internally when referencing facts.\n[الخدمات] نقدم كشف واستشارة ومتابعة علاج.",
    );
    assert.match(aboutServices.text, /عن خدماتنا/);
    assert.match(aboutServices.text, /كشف واستشارة/);
    assert.deepEqual(aboutServices.queries, []);
    assert.doesNotMatch(aboutServices.text, /مش لاقي المنتج|PRD-DSUD/);
  });

  it("loads product details with delivery images when the customer asks for photos", async () => {
    const result = await ask("عايز صور المنتج", [software], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /^دي صور فاليواور سوفتوير سوليوشن \(PRD-DSUD\):$/u);
    assert.doesNotMatch(result.text, /الوصف:/);
    const details = result.toolExecutions.find((row) => row.toolKey === "get_product_details");
    assert.equal(details?.status, "succeeded");
    assert.deepEqual(details?.output?.deliveryImages, [
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
  });

  it("says there are no photos when the product has none", async () => {
    const bare = { ...software, imageCount: 0, deliveryImages: [] };
    const result = await ask("وريني صور PRD-DSUD", [bare]);
    assert.match(result.text, /مفيش صور مسجّلة/);
  });

  it("lists and prices a product without inventing empty SKU parentheses", async () => {
    const noSku = {
      ...software,
      sku: "",
      name: "منتج بدون رمز",
      price: { status: "listed", amount: 99, currency: "EGP" },
    };
    const listed = await ask("ايه المنتجات", [noSku]);
    assert.match(listed.text, /- منتج بدون رمز$/m);
    assert.doesNotMatch(listed.text, /\(\s*\)/);

    // Name in the price ask (history without parseable SKU must not invent parentheses).
    const priced = await ask("بكام منتج بدون رمز", [noSku]);
    assert.match(priced.text, /^سعر منتج بدون رمز: 99 EGP$/u);
    assert.doesNotMatch(priced.text, /\(\s*\)/);
    assert.doesNotMatch(priced.text, /الرمز:/);

    const detailed = await ask("تفاصيل وسعر منتج بدون رمز", [noSku]);
    assert.match(detailed.text, /^منتج بدون رمز$/m);
    assert.doesNotMatch(detailed.text, /^الرمز:/m);
    assert.doesNotMatch(detailed.text, /\(\s*\)/);
    assert.match(detailed.text, /السعر: 99 EGP/);
  });

  it("answers with price only without repeating the full product card", async () => {
    const result = await ask("بكام السعر؟", [software], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /^سعر فاليواور سوفتوير سوليوشن \(PRD-DSUD\): 1200 EGP$/u);
    assert.doesNotMatch(result.text, /الوصف:/);
    assert.doesNotMatch(result.text, /^الرمز:/m);
  });

  it("lists prices for all catalog products when asked in plural", async () => {
    const second = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("سعر المنتجات كام", [software, second], "", [
      {
        role: "assistant",
        content:
          "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة\n\nSprint Verify Widget\nالرمز: SVW-001\nالنوع: منتج",
      },
    ]);
    assert.match(result.text, /أسعار المنتجات:/);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن \(PRD-DSUD\): 1200 EGP/);
    assert.match(result.text, /Sprint Verify Widget \(SVW-001\): 500 EGP/);
    assert.doesNotMatch(result.text, /أنهي منتج سعره/);
  });

  it("leaves booking requests to the booking flow", async () => {
    const queries: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "model",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 1,
        };
      },
    };
    const service = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["search_products"],
        route: async (_ctx, request) => {
          queries.push(String((request.input as { query?: string } | undefined)?.query ?? ""));
          return {
            toolKey: request.toolKey,
            executionId: "exec-products",
            status: "succeeded" as const,
            durationMs: 1,
            output: { success: true, products: [software] },
          };
        },
      },
    });
    const result = await service.run({
      ctx,
      conversationId: "conversation-products",
      gatewayRequest: {
        messages: [{ role: "user", content: "عايز احجز" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_products" } }],
      allowedToolKeys: ["search_products"],
    });
    assert.deepEqual(queries, []);
    assert.doesNotMatch(result.response.text, /PRD-DSUD/);
  });

  it("combines details, price, and photos in one customer turn", async () => {
    const result = await ask("عايز التفاصيل والسعر والصور", [software], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.match(result.text, /1200 EGP/);
    assert.match(result.text, /دي صور فاليواور سوفتوير سوليوشن \(PRD-DSUD\):/);
    const details = result.toolExecutions.find((row) => row.toolKey === "get_product_details");
    assert.deepEqual(details?.output?.deliveryImages, [
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
  });

  it("answers tax inclusion from the catalog field without publishing the rate", async () => {
    const inclusive = { ...software, tax: { included: true } };
    const exclusive = {
      ...software,
      name: "جهاز فحص",
      sku: "DEV-14",
      tax: { included: false },
      price: { status: "listed", amount: 114, currency: "EGP" },
    };
    const included = await ask("السعر شامل الضريبة؟", [inclusive], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(included.text, /سعر فاليواور سوفتوير سوليوشن شامل الضريبة/);
    assert.doesNotMatch(included.text, /14|صافي|net/i);

    const excluded = await ask("شامل الضريبة ولا لأ؟", [exclusive], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- جهاز فحص (DEV-14)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(excluded.text, /سعر جهاز فحص غير شامل الضريبة/);
    assert.doesNotMatch(excluded.text, /14/);

    const priced = await ask("بكام شامل الضريبة؟", [exclusive], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- جهاز فحص (DEV-14)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(priced.text, /سعر جهاز فحص \(DEV-14\): 114 EGP/);
    assert.match(priced.text, /شامل الضريبة/);
    assert.doesNotMatch(priced.text, /صافي|14%/);

    const rate = await ask("الضريبة كام في المية؟", [exclusive], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- جهاز فحص (DEV-14)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(rate.text, /معلومة الضرائب مش مسجّلة في الكتالوج/);
    assert.doesNotMatch(rate.text, /14/);
  });

  it("never mentions tax when the product tax mode is unspecified", async () => {
    const unspecified = { ...software, tax: { mode: "unspecified" } };
    const history = [
      {
        role: "assistant" as const,
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ];
    const asked = await ask("بكام شامل الضريبة؟", [unspecified], "", history);
    assert.match(asked.text, /1200 EGP/);
    assert.doesNotMatch(asked.text, /شامل|غير شامل|الضريبة|مش مسجّلة/);

    const details = await ask("عايز التفاصيل", [unspecified], "", history);
    assert.match(details.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.doesNotMatch(details.text, /الضريبة/);
  });

  it("omits tax from details when price is not requested", async () => {
    const result = await ask("عايز التفاصيل", [{ ...software, tax: { included: true } }], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.doesNotMatch(result.text, /شامل الضريبة|غير شامل الضريبة/);
  });

  it("strips tax phrases embedded in the catalog description when price is not shown", async () => {
    const result = await ask(
      "عايز التفاصيل",
      [
        {
          ...software,
          tax: { included: true },
          description: "منصة تشغيل للعيادات والمستشفيات. السعر شامل الضريبة",
        },
      ],
      "",
      [
        {
          role: "assistant",
          content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
        },
      ],
    );
    assert.match(result.text, /الوصف:\s*منصة تشغيل للعيادات والمستشفيات/);
    assert.doesNotMatch(result.text, /شامل الضريبة|غير شامل الضريبة/);
  });

  it("keeps description line breaks and WhatsApp bold markers for the customer", async () => {
    const result = await ask(
      "عايز التفاصيل",
      [
        {
          ...software,
          description: "سطر أول عن المنتج.\n*ميزة مهمة*\nسطر تالت بعد النقطة. جملة جديدة بعدها",
        },
      ],
      "",
      [
        {
          role: "assistant",
          content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
        },
      ],
    );
    assert.match(result.text, /الوصف:\nسطر أول عن المنتج\.\n\*ميزة مهمة\*\nسطر تالت بعد النقطة\.\nجملة جديدة بعدها/);
  });

  it("attaches tax inclusion only with the price block", async () => {
    const history = [
      {
        role: "assistant" as const,
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ];
    const priced = await ask("بكام؟", [{ ...software, tax: { included: true } }], "", history);
    assert.match(priced.text, /سعر فاليواور سوفتوير سوليوشن \(PRD-DSUD\): 1200 EGP\nالسعر شامل الضريبة/);
    assert.doesNotMatch(priced.text, /الوصف:/);

    const detailsWithPrice = await ask("عايز التفاصيل والسعر", [{ ...software, tax: { included: true } }], "", history);
    assert.match(detailsWithPrice.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.match(detailsWithPrice.text, /السعر: 1200 EGP\nالسعر شامل الضريبة/);
  });

  it("says warranty is not in the catalog while still answering price", async () => {
    const result = await ask("بكام وفيه ضمان؟", [software], "", [
      {
        role: "assistant",
        content: "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /سعر فاليواور سوفتوير سوليوشن \(PRD-DSUD\): 1200 EGP/);
    assert.match(result.text, /معلومة الضمان مش مسجّلة في الكتالوج/);
    assert.doesNotMatch(result.text, /سنتين|year warranty/i);
  });

  it("compares two named products from catalog data without attaching a photo gallery", async () => {
    const widget = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      description: "حل للتحقق من الهوية",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("قارن فاليواور و Sprint Verify Widget", [software, widget]);
    assert.match(result.text, /فاليواور سوفتوير سوليوشن/);
    assert.match(result.text, /Sprint Verify Widget/);
    assert.match(result.text, /الوصف: منصة تشغيل للعيادات والمستشفيات/);
    assert.match(result.text, /الوصف: حل للتحقق من الهوية/);
    assert.doesNotMatch(result.text, /أنهي منتج/);
    assert.equal(
      result.toolExecutions.some(
        (row) => Array.isArray(row.output?.deliveryImages) && row.output.deliveryImages.length > 0,
      ),
      false,
    );
  });

  it("asks which previous product when the customer refers back after two products", async () => {
    const result = await ask("اللي فات", [software], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
      { role: "user", content: "وريني Sprint Verify Widget" },
      {
        role: "assistant",
        content: "Sprint Verify Widget\nالرمز: SVW-001\nالنوع: منتج",
      },
    ]);
    assert.match(result.text, /أنهي منتج تقصد؟/);
    assert.match(result.text, /PRD-DSUD/);
    assert.match(result.text, /SVW-001/);
  });

  it("answers the latest product price after the customer switches products", async () => {
    const widget = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("طب سعره كام؟", [software, widget], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
      { role: "user", content: "عايز Sprint Verify Widget" },
      {
        role: "assistant",
        content: "Sprint Verify Widget\nالرمز: SVW-001\nالنوع: منتج\nالوصف: أداة تحقق",
      },
    ]);
    assert.match(result.text, /^سعر Sprint Verify Widget \(SVW-001\): 500 EGP$/u);
    assert.doesNotMatch(result.text, /1200 EGP/);
  });

  it("prices the second listed product when the customer says the other one", async () => {
    const widget = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("التاني بكام؟", [software, widget], "", [
      {
        role: "assistant",
        content:
          "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\n- Sprint Verify Widget (SVW-001)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /سعر Sprint Verify Widget \(SVW-001\): 500 EGP/);
    assert.doesNotMatch(result.text, /1200 EGP/);
  });

  it("sends photos for a pronoun only after one product was identified", async () => {
    const result = await ask("ابعت صورته", [software], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
    ]);
    assert.match(result.text, /دي صور فاليواور سوفتوير سوليوشن \(PRD-DSUD\):/);
  });

  it("understands a stuttered price question without calling the model", async () => {
    const result = await ask("بكااام؟", [software], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
    ]);
    assert.match(result.text, /سعر فاليواور سوفتوير سوليوشن \(PRD-DSUD\): 1200 EGP/);
  });

  it("does not invent delivery when the catalog has no shipping fact", async () => {
    const result = await ask("التوصيل متاح؟", [software], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
    ]);
    assert.match(result.text, /معلومة التوصيل مش مسجّلة في الكتالوج/);
    assert.doesNotMatch(result.text, /مجانا|free shipping|خلال يوم/i);
  });

  it("asks which product when the price pronoun follows two listings", async () => {
    const widget = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("سعره كام؟", [software, widget], "", [
      {
        role: "assistant",
        content:
          "المنتجات المتاحة:\n- فاليواور سوفتوير سوليوشن (PRD-DSUD)\n- Sprint Verify Widget (SVW-001)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
    ]);
    assert.match(result.text, /أنهي منتج سعره؟/);
    assert.match(result.text, /PRD-DSUD/);
    assert.match(result.text, /SVW-001/);
  });

  it("reuses the clinic product the customer already picked when they later ask price", async () => {
    const clinic = {
      productId: "p-clinic",
      name: "سيستم عيادات النور",
      sku: "CLN-OS",
      productType: "service",
      summary: "نظام إدارة العيادات",
      description: "نظام إدارة العيادات والمستشفيات",
      price: { status: "listed", amount: 2500, currency: "EGP" },
    };
    const widget = {
      productId: "p-2",
      name: "Sprint Verify Widget",
      sku: "SVW-001",
      productType: "product",
      summary: "أداة تحقق",
      price: { status: "listed", amount: 500, currency: "EGP" },
    };
    const result = await ask("بكام؟", [clinic, widget], "", [
      {
        role: "assistant",
        content:
          "المنتجات المتاحة:\n- سيستم عيادات النور (CLN-OS)\n- Sprint Verify Widget (SVW-001)\nلو عايز منتج معين ابعت اسمه أو رمزه.",
      },
      { role: "user", content: "سيستم عيادات النور" },
      {
        role: "assistant",
        content: "تمام، سيستم عيادات النور من منتجاتنا.",
      },
    ]);
    assert.match(result.text, /سعر سيستم عيادات النور \(CLN-OS\): 2500 EGP/);
    assert.doesNotMatch(result.text, /أنهي منتج سعره/);
    assert.doesNotMatch(result.text, /SVW-001/);
  });

  it("does not quote a price or send photos when the price is hidden and photos were not requested", async () => {
    const hidden = {
      ...software,
      price: { status: "not_listed" },
      imageCount: 2,
      deliveryImages: ["https://cdn.example/a.jpg"],
    };
    const result = await ask("بكام؟", [hidden], "", [
      {
        role: "assistant",
        content: "فاليواور سوفتوير سوليوشن\nالرمز: PRD-DSUD\nالنوع: خدمة",
      },
    ]);
    assert.match(result.text, /غير متاح حاليًا/);
    assert.doesNotMatch(result.text, /1200/);
    assert.equal(
      result.toolExecutions.some(
        (row) => Array.isArray(row.output?.deliveryImages) && row.output.deliveryImages.length > 0,
      ),
      false,
    );
  });

  it("does not search the catalog for a complaint", async () => {
    const queries: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "ticket-path",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 1,
        };
      },
    };
    const service = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["search_products", "create_ticket"],
        route: async (_ctx, request) => {
          queries.push(request.toolKey);
          return {
            toolKey: request.toolKey,
            executionId: "exec-other",
            status: "succeeded" as const,
            durationMs: 1,
            output: { success: true, products: [software] },
          };
        },
      },
    });
    const result = await service.run({
      ctx,
      conversationId: "conversation-products",
      gatewayRequest: {
        messages: [{ role: "user", content: "عايز أفتح شكوى" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-products", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_products" } },
        { type: "function", function: { name: "create_ticket" } },
      ],
      allowedToolKeys: ["search_products", "create_ticket"],
    });
    assert.equal(queries.includes("search_products"), false);
    assert.doesNotMatch(result.response.text, /PRD-DSUD/);
  });

  it("reads the company policy from knowledge", async () => {
    const result = await ask(
      "قولي سياسه الشركه",
      [],
      "Use the following company knowledge to answer accurately. Cite sources internally when referencing facts.\n[سياسة الشركة] المواعيد تُلغى قبل 24 ساعة.",
    );
    assert.deepEqual(result.queries, []);
    assert.match(result.text, /من سياسة الشركة/);
    assert.match(result.text, /المواعيد تُلغى قبل 24 ساعة/);
    assert.doesNotMatch(result.text, /Cite sources/);
  });
});
