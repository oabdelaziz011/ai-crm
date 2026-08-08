import { fieldValue } from "../../contracts/field-value.js";
import type { ProviderContext } from "../../contracts/provider-context.js";
import type {
  BuyingSignal,
  BuyingSignalType,
  CountryIntel,
  DetectedEntities,
  IntentLabel,
  LeadScoreDimensions,
  MemoryFact,
  RecommendationAction,
  RiskSignal,
  RiskSignalType,
  SentimentLabel,
  TemperatureBand,
} from "../../contracts/pipeline-result.js";
import type {
  BuyingSignalsProvider,
  CompanyProvider,
  CountryProvider,
  EntityProvider,
  IdentityProvider,
  IndustryProvider,
  IntentProvider,
  LanguageProvider,
  LeadIntelligenceProviders,
  LeadScoreProvider,
  MemoryProvider,
  ProviderResult,
  ProviderRunMeta,
  RecommendationProvider,
  RiskSignalsProvider,
  SentimentProvider,
  SummaryProvider,
  TemperatureProvider,
} from "../../contracts/providers.js";
import {
  HEURISTIC_MODEL,
  HEURISTIC_VERSION,
  countryFromPhone,
  customerText,
  detectScriptLanguage,
  extractEmails,
  extractPhones,
  extractUrls,
  joinedText,
  lastMessagesSummary,
  matchAny,
  nowIso,
  scoreKeywordHits,
} from "./text-utils.js";

function timedMeta(
  providerId: string,
  started: number,
  reason?: string,
): ProviderRunMeta {
  return Object.freeze({
    providerId,
    model: HEURISTIC_MODEL,
    version: HEURISTIC_VERSION,
    latencyMs: Math.max(0, Date.now() - started),
    reason,
  });
}

function corpus(ctx: ProviderContext): string {
  const fromMessages = joinedText(ctx.messages);
  const customer = customerText(ctx.messages);
  return `${customer}\n${fromMessages}`.trim() || fromMessages;
}

function phoneCandidates(ctx: ProviderContext): string[] {
  const out: string[] = [];
  if (ctx.lead.phone) out.push(ctx.lead.phone);
  out.push(...extractPhones(corpus(ctx)));
  const meta = ctx.lead.metadata;
  if (meta && typeof meta === "object") {
    const capture = (meta as Record<string, unknown>).aiCapture;
    if (capture && typeof capture === "object") {
      const keys = (capture as Record<string, unknown>).identityKeys;
      if (keys && typeof keys === "object" && typeof (keys as Record<string, unknown>).phone === "string") {
        out.push(String((keys as Record<string, unknown>).phone));
      }
    }
  }
  return out;
}

const INTENT_PATTERNS: ReadonlyArray<{ label: IntentLabel; patterns: RegExp[]; confidence: number }> = [
  {
    label: "pricing",
    patterns: [/pric(e|ing)/i, /cost/i, /quote/i, /كم السعر/, /التسعير/, /سعر/, /عرض سعر/],
    confidence: 0.82,
  },
  {
    label: "demo",
    patterns: [/demo/i, /walkthrough/i, /تجربة/, /ديمو/, /عرض تجريبي/],
    confidence: 0.84,
  },
  {
    label: "implementation",
    patterns: [/implement/i, /rollout/i, /go[\s-]?live/i, /تنفيذ/, /تشغيل/, /إطلاق/],
    confidence: 0.78,
  },
  {
    label: "support",
    patterns: [/support/i, /help me/i, /issue/i, /دعم/, /مساعدة/, /مشكلة/],
    confidence: 0.75,
  },
  {
    label: "complaint",
    patterns: [/complaint/i, /frustrated/i, /unacceptable/i, /شكوى/, /سيء/, /زعلان/],
    confidence: 0.8,
  },
  {
    label: "billing",
    patterns: [/billing/i, /invoice/i, /payment/i, /فاتورة/, /دفع/, /اشتراك/],
    confidence: 0.8,
  },
  {
    label: "integration",
    patterns: [/integrat/i, /api/i, /webhook/i, /تكامل/, /ربط النظام/],
    confidence: 0.8,
  },
];

const INDUSTRY_KEYWORDS: ReadonlyArray<{ industry: string; patterns: RegExp[]; confidence: number }> = [
  { industry: "retail", patterns: [/retail/i, /store/i, /تجزئة/, /متجر/, /محل/], confidence: 0.72 },
  { industry: "healthcare", patterns: [/hospital/i, /clinic/i, /healthcare/i, /مستشفى/, /عيادة/, /صحة/], confidence: 0.74 },
  { industry: "finance", patterns: [/bank/i, /fintech/i, /finance/i, /بنك/, /مالية/, /تمويل/], confidence: 0.74 },
  { industry: "education", patterns: [/school/i, /university/i, /education/i, /مدرسة/, /جامعة/, /تعليم/], confidence: 0.72 },
  { industry: "hospitality", patterns: [/hotel/i, /restaurant/i, /hospitality/i, /فندق/, /مطعم/], confidence: 0.72 },
  { industry: "technology", patterns: [/saas/i, /software/i, /tech/i, /برمجة/, /تقنية/, /سوفت وير/], confidence: 0.7 },
  { industry: "real_estate", patterns: [/real[\s-]?estate/i, /property/i, /عقارات/, /عقار/], confidence: 0.72 },
  { industry: "logistics", patterns: [/logistics/i, /shipping/i, /warehouse/i, /شحن/, /مستودع/, /لوجست/], confidence: 0.72 },
];

const BUYING_PATTERNS: ReadonlyArray<{ type: BuyingSignalType; patterns: RegExp[]; confidence: number }> = [
  { type: "asked_pricing", patterns: [/pric(e|ing)/i, /how much/i, /كم السعر/, /التسعير/, /سعر/], confidence: 0.8 },
  { type: "mentioned_budget", patterns: [/budget/i, /ميزانية/, /موازنة/], confidence: 0.82 },
  { type: "mentioned_employees", patterns: [/employees?/i, /\d+\s*(staff|people|seats)/i, /موظف/, /موظفين/, /فريق/], confidence: 0.78 },
  { type: "requested_demo", patterns: [/demo/i, /book a call/i, /تجربة/, /ديمو/, /عرض تجريبي/], confidence: 0.84 },
  { type: "requested_proposal", patterns: [/proposal/i, /rfp/i, /عرض سعر/, /مقترح/], confidence: 0.82 },
  { type: "mentioned_decision_maker", patterns: [/decision maker/i, /my (boss|manager|ceo)/i, /صاحب القرار/, /المدير/, /السيو/], confidence: 0.76 },
  { type: "mentioned_competitor", patterns: [/competitor/i, /vs\.?\s+\w+/i, /منافس/, /بديل/], confidence: 0.74 },
];

const RISK_PATTERNS: ReadonlyArray<{ type: RiskSignalType; patterns: RegExp[]; confidence: number }> = [
  { type: "budget_objection", patterns: [/too expensive/i, /no budget/i, /غالي/, /ما في ميزانية/, /مكلف/], confidence: 0.82 },
  { type: "using_competitor", patterns: [/already use/i, /we use \w+/i, /نستخدم حاليا/, /عندنا نظام/], confidence: 0.78 },
  { type: "decision_delay", patterns: [/next quarter/i, /not now/i, /later/i, /لاحقا/, /مو الحين/, /بعدين/], confidence: 0.74 },
  { type: "not_decision_maker", patterns: [/just researching/i, /need to ask/i, /لست صاحب القرار/, /بس أسأل/, /ابحث فقط/], confidence: 0.76 },
];

const POSITIVE = [/great/i, /thanks/i, /interested/i, /excited/i, /ممتاز/, /شكرا/, /مهتم/, /رائع/, /تمام/];
const NEGATIVE = [/angry/i, /frustrated/i, /terrible/i, /hate/i, /سيء/, /زعلان/, /مشكلة كبيرة/, /مستاء/];

export function createHeuristicLanguageProvider(): LanguageProvider {
  return {
    async detectLanguage(ctx) {
      const started = Date.now();
      const text = corpus(ctx);
      const detected = detectScriptLanguage(text);
      const localeHint = ctx.config.localeHints?.[0];
      let lang = detected.lang === "unknown" && localeHint ? localeHint.slice(0, 2).toLowerCase() : detected.lang;
      let confidence = detected.confidence;
      if (detected.lang === "unknown" && localeHint) {
        confidence = 0.45;
        lang = localeHint.slice(0, 2).toLowerCase();
      }
      return {
        data: fieldValue(lang || "unknown", confidence, "heuristic.language"),
        meta: timedMeta("language", started, `script=${detected.lang}`),
      };
    },
  };
}

export function createHeuristicCountryProvider(): CountryProvider {
  return {
    async detectCountry(ctx): Promise<ProviderResult<CountryIntel>> {
      const started = Date.now();
      const at = nowIso();
      const phones = phoneCandidates(ctx);
      let hint = null as ReturnType<typeof countryFromPhone>;
      for (const p of phones) {
        hint = countryFromPhone(p);
        if (hint) break;
      }
      const source = "heuristic.country.phone";
      if (!hint) {
        const lang = ctx.prior.language?.value;
        const fallbackLang = lang === "ar" ? "ar" : lang === "en" ? "en" : null;
        return {
          data: {
            country: fieldValue(null, 0.15, source, at),
            countryCode: fieldValue(null, 0.15, source, at),
            market: fieldValue(null, 0.15, source, at),
            timezone: fieldValue(null, 0.15, source, at),
            currency: fieldValue(null, 0.15, source, at),
            language: fieldValue(fallbackLang, fallbackLang ? 0.4 : 0.15, source, at),
            locale: fieldValue(null, 0.15, source, at),
          },
          meta: timedMeta("country", started, "no_phone_match"),
        };
      }
      const c = hint.confidence;
      return {
        data: {
          country: fieldValue(hint.country, c, source, at),
          countryCode: fieldValue(hint.countryCode, c, source, at),
          market: fieldValue(hint.market, c * 0.95, source, at),
          timezone: fieldValue(hint.timezone, c * 0.9, source, at),
          currency: fieldValue(hint.currency, c * 0.9, source, at),
          language: fieldValue(hint.language, c * 0.85, source, at),
          locale: fieldValue(hint.locale, c * 0.88, source, at),
        },
        meta: timedMeta("country", started, `code=${hint.countryCode}`),
      };
    },
  };
}

export function createHeuristicIdentityProvider(): IdentityProvider {
  return {
    async extractIdentity(ctx) {
      const started = Date.now();
      const at = nowIso();
      const text = corpus(ctx);
      const existing = ctx.lead.contactName?.trim();
      if (existing && !/^unknown/i.test(existing)) {
        return {
          data: fieldValue(existing, 0.7, "lead.snapshot.contactName", at),
          meta: timedMeta("identity", started, "from_snapshot"),
        };
      }

      const patterns = [
        /(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:اسمي|أنا|انا)\s+([^\s،,.!?]+(?:\s+[^\s،,.!?]+)?)/,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const name = m[1].trim();
          if (name.length >= 2) {
            return {
              data: fieldValue(name, 0.78, "heuristic.identity.name_pattern", at),
              meta: timedMeta("identity", started, "pattern_match"),
            };
          }
        }
      }
      return {
        data: fieldValue(null, 0.2, "heuristic.identity", at),
        meta: timedMeta("identity", started, "no_match"),
      };
    },
  };
}

export function createHeuristicCompanyProvider(): CompanyProvider {
  return {
    async extractCompany(ctx) {
      const started = Date.now();
      const at = nowIso();
      const existing = ctx.lead.companyName?.trim();
      if (existing) {
        return {
          data: fieldValue(existing, 0.7, "lead.snapshot.companyName", at),
          meta: timedMeta("company", started, "from_snapshot"),
        };
      }
      const text = corpus(ctx);
      const patterns = [
        /(?:from|at|company)\s+([A-Z][\w&.\-]+(?:\s+[A-Z][\w&.\-]+){0,3})/,
        /(?:شركة|من شركة|مؤسسة)\s+([^\s،,.!?]+(?:\s+[^\s،,.!?]+){0,3})/,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
          const name = m[1].trim();
          if (name.length >= 2) {
            return {
              data: fieldValue(name, 0.74, "heuristic.company.keyword", at),
              meta: timedMeta("company", started, "pattern_match"),
            };
          }
        }
      }
      return {
        data: fieldValue(null, 0.2, "heuristic.company", at),
        meta: timedMeta("company", started, "no_match"),
      };
    },
  };
}

export function createHeuristicIndustryProvider(): IndustryProvider {
  return {
    async detectIndustry(ctx) {
      const started = Date.now();
      const at = nowIso();
      const text = corpus(ctx);
      let best: { industry: string; confidence: number } | null = null;
      for (const row of INDUSTRY_KEYWORDS) {
        if (matchAny(text, row.patterns)) {
          if (!best || row.confidence > best.confidence) {
            best = { industry: row.industry, confidence: row.confidence };
          }
        }
      }
      return {
        data: fieldValue(best?.industry ?? null, best?.confidence ?? 0.15, "heuristic.industry", at),
        meta: timedMeta("industry", started, best ? best.industry : "none"),
      };
    },
  };
}

export function createHeuristicIntentProvider(): IntentProvider {
  return {
    async detectIntents(ctx) {
      const started = Date.now();
      const at = nowIso();
      const text = corpus(ctx);
      const intents = INTENT_PATTERNS.filter((row) => matchAny(text, row.patterns)).map((row) =>
        fieldValue(row.label, row.confidence, "heuristic.intent.keyword", at),
      );
      return {
        data: Object.freeze(intents),
        meta: timedMeta("intent", started, `count=${intents.length}`),
      };
    },
  };
}

export function createHeuristicEntityProvider(): EntityProvider {
  return {
    async extractEntities(ctx): Promise<ProviderResult<DetectedEntities>> {
      const started = Date.now();
      const at = nowIso();
      const text = corpus(ctx);
      const emails = extractEmails(text).map((e) => fieldValue(e, 0.9, "heuristic.entity.email", at));
      const phones = extractPhones(text).map((p) => fieldValue(p, 0.85, "heuristic.entity.phone", at));
      if (ctx.lead.email?.trim()) {
        const lower = ctx.lead.email.trim().toLowerCase();
        if (!emails.some((e) => e.value === lower)) {
          emails.unshift(fieldValue(lower, 0.88, "lead.snapshot.email", at));
        }
      }
      if (ctx.lead.phone?.trim()) {
        const ph = ctx.lead.phone.trim();
        if (!phones.some((p) => p.value.includes(ph.replace(/\D/g, "").slice(-8)))) {
          phones.unshift(fieldValue(ph, 0.88, "lead.snapshot.phone", at));
        }
      }
      const urls = extractUrls(text).map((u) => fieldValue(u, 0.8, "heuristic.entity.url", at));
      return {
        data: Object.freeze({
          emails: Object.freeze(emails),
          phones: Object.freeze(phones),
          urls: Object.freeze(urls),
        }),
        meta: timedMeta("entity", started),
      };
    },
  };
}

export function createHeuristicSummaryProvider(): SummaryProvider {
  return {
    async summarize(ctx) {
      const started = Date.now();
      const at = nowIso();
      const summary = lastMessagesSummary(ctx.messages);
      const confidence = summary.length >= 40 ? 0.65 : summary.length >= 12 ? 0.45 : 0.2;
      return {
        data: fieldValue(summary || "No conversation summary available.", confidence, "heuristic.summary.extractive", at),
        meta: timedMeta("summary", started),
      };
    },
  };
}

export function createHeuristicSentimentProvider(): SentimentProvider {
  return {
    async analyzeSentiment(ctx) {
      const started = Date.now();
      const at = nowIso();
      const text = corpus(ctx);
      const pos = scoreKeywordHits(text, POSITIVE);
      const neg = scoreKeywordHits(text, NEGATIVE);
      let label: SentimentLabel = "neutral";
      let confidence = 0.5;
      if (pos > neg) {
        label = "positive";
        confidence = Math.min(0.9, 0.55 + pos * 0.12);
      } else if (neg > pos) {
        label = "negative";
        confidence = Math.min(0.9, 0.55 + neg * 0.12);
      } else if (pos === 0 && neg === 0) {
        confidence = 0.4;
      }
      return {
        data: fieldValue(label, confidence, "heuristic.sentiment.keywords", at),
        meta: timedMeta("sentiment", started, `pos=${pos},neg=${neg}`),
      };
    },
  };
}

export function createHeuristicBuyingSignalsProvider(): BuyingSignalsProvider {
  return {
    async detectBuyingSignals(ctx) {
      const started = Date.now();
      const text = corpus(ctx);
      const ts = ctx.messages.at(-1)?.createdAt ?? nowIso();
      const signals: BuyingSignal[] = [];
      for (const row of BUYING_PATTERNS) {
        if (matchAny(text, row.patterns)) {
          signals.push(
            Object.freeze({
              type: row.type,
              confidence: row.confidence,
              source: "heuristic.buying.keyword",
              timestamp: ts,
            }),
          );
        }
      }
      return {
        data: Object.freeze(signals),
        meta: timedMeta("buyingSignals", started, `count=${signals.length}`),
      };
    },
  };
}

export function createHeuristicRiskSignalsProvider(): RiskSignalsProvider {
  return {
    async detectRiskSignals(ctx) {
      const started = Date.now();
      const text = corpus(ctx);
      const ts = ctx.messages.at(-1)?.createdAt ?? nowIso();
      const signals: RiskSignal[] = [];

      if (ctx.prior.sentiment?.value === "negative") {
        signals.push(
          Object.freeze({
            type: "negative_sentiment" as const,
            confidence: ctx.prior.sentiment.confidence,
            source: "heuristic.risk.from_sentiment",
            timestamp: ts,
          }),
        );
      }

      for (const row of RISK_PATTERNS) {
        if (matchAny(text, row.patterns)) {
          signals.push(
            Object.freeze({
              type: row.type,
              confidence: row.confidence,
              source: "heuristic.risk.keyword",
              timestamp: ts,
            }),
          );
        }
      }

      // Long silence: gap > 72h between last two messages
      if (ctx.messages.length >= 2) {
        const a = Date.parse(ctx.messages.at(-2)!.createdAt);
        const b = Date.parse(ctx.messages.at(-1)!.createdAt);
        if (Number.isFinite(a) && Number.isFinite(b) && b - a > 72 * 3600_000) {
          signals.push(
            Object.freeze({
              type: "long_silence" as const,
              confidence: 0.7,
              source: "heuristic.risk.message_gap",
              timestamp: ts,
            }),
          );
        }
      }

      return {
        data: Object.freeze(signals),
        meta: timedMeta("riskSignals", started, `count=${signals.length}`),
      };
    },
  };
}

export function createHeuristicTemperatureProvider(): TemperatureProvider {
  return {
    async assessTemperature(ctx) {
      const started = Date.now();
      const at = nowIso();
      const buying = ctx.prior.buyingSignals?.length ?? 0;
      const risk = ctx.prior.riskSignals?.length ?? 0;
      const intents = ctx.prior.intents?.length ?? 0;
      let band: TemperatureBand = "cold";
      let confidence = 0.55;
      if (buying >= 2 && risk <= 1) {
        band = "hot";
        confidence = 0.82;
      } else if (buying >= 1 || intents >= 2) {
        band = "warm";
        confidence = 0.72;
      } else if (risk >= 2) {
        band = "cold";
        confidence = 0.7;
      }
      return {
        data: fieldValue(band, confidence, "heuristic.temperature.signals", at),
        meta: timedMeta("temperature", started, band),
      };
    },
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function createHeuristicLeadScoreProvider(): LeadScoreProvider {
  return {
    async scoreLead(ctx): Promise<ProviderResult<LeadScoreDimensions>> {
      const started = Date.now();
      const at = nowIso();
      const buying = ctx.prior.buyingSignals?.length ?? 0;
      const risk = ctx.prior.riskSignals?.length ?? 0;
      const intents = ctx.prior.intents?.length ?? 0;
      const msgCount = ctx.messages.length;
      const band = ctx.prior.temperature?.value ?? "cold";

      const engagement = clampScore(20 + msgCount * 6 + intents * 8);
      const salesReadiness = clampScore(15 + buying * 14 - risk * 10);
      const businessFit = clampScore(
        40 +
          (ctx.prior.companyName?.value ? 15 : 0) +
          (ctx.prior.industry?.value ? 15 : 0) +
          (ctx.prior.country?.countryCode?.value ? 10 : 0),
      );
      const temperatureScore =
        band === "hot" ? 85 : band === "warm" ? 60 : 30;
      const overall = clampScore(
        engagement * 0.25 + salesReadiness * 0.35 + businessFit * 0.25 + temperatureScore * 0.15,
      );
      const conf = 0.7;

      return {
        data: {
          overall: fieldValue(overall, conf, "heuristic.score", at),
          engagement: fieldValue(engagement, conf, "heuristic.score.engagement", at),
          salesReadiness: fieldValue(salesReadiness, conf, "heuristic.score.salesReadiness", at),
          businessFit: fieldValue(businessFit, conf, "heuristic.score.businessFit", at),
          temperature: fieldValue(temperatureScore, conf, "heuristic.score.temperature", at),
          temperatureBand: fieldValue(band, ctx.prior.temperature?.confidence ?? 0.55, "heuristic.score.temperatureBand", at),
        },
        meta: timedMeta("leadScore", started, `overall=${overall}`),
      };
    },
  };
}

export function createHeuristicRecommendationProvider(): RecommendationProvider {
  return {
    async recommend(ctx) {
      const started = Date.now();
      const actions: RecommendationAction[] = [];
      const intents = new Set((ctx.prior.intents ?? []).map((i) => i.value));
      const overall = ctx.prior.score?.overall.value ?? 0;
      const band = ctx.prior.temperature?.value ?? "cold";

      if (intents.has("demo") || band === "hot") {
        actions.push({
          action: "schedule_demo",
          confidence: 0.8,
          reason: "Demo intent or hot temperature detected",
          source: "heuristic.recommendation",
        });
      }
      if (intents.has("pricing") || (ctx.prior.buyingSignals ?? []).some((s) => s.type === "asked_pricing")) {
        actions.push({
          action: "send_pricing",
          confidence: 0.78,
          reason: "Pricing interest detected",
          source: "heuristic.recommendation",
        });
      }
      if ((ctx.prior.riskSignals ?? []).length > 0) {
        actions.push({
          action: "address_objections",
          confidence: 0.72,
          reason: "Risk signals present",
          source: "heuristic.recommendation",
        });
      }
      if (overall < 40) {
        actions.push({
          action: "nurture_sequence",
          confidence: 0.7,
          reason: "Low overall score — nurture before hard sell",
          source: "heuristic.recommendation",
        });
      }
      if (actions.length === 0) {
        actions.push({
          action: "continue_discovery",
          confidence: 0.6,
          reason: "Gather more context before next sales step",
          source: "heuristic.recommendation",
        });
      }

      return {
        data: Object.freeze(actions),
        meta: timedMeta("recommendation", started, `count=${actions.length}`),
      };
    },
  };
}

export function createHeuristicMemoryProvider(): MemoryProvider {
  return {
    async extractMemory(ctx) {
      const started = Date.now();
      const at = nowIso();
      const facts: MemoryFact[] = [];
      const priorFacts = new Map((ctx.prior.memoryFacts ?? []).map((f) => [f.factKey, f]));

      const upsert = (factKey: string, factValue: string, confidence: number, source: string) => {
        const existing = priorFacts.get(factKey);
        if (existing) {
          // Merge: keep higher confidence; append value nuance only if different and lower conf doesn't wipe.
          if (confidence >= existing.confidence) {
            facts.push({ factKey, factValue, confidence, source, updatedAt: at });
          } else {
            facts.push({ ...existing });
          }
          priorFacts.delete(factKey);
          return;
        }
        facts.push({ factKey, factValue, confidence, source, updatedAt: at });
      };

      if (ctx.prior.language?.value) {
        upsert("preferred_language", ctx.prior.language.value, ctx.prior.language.confidence, ctx.prior.language.source);
      }
      const channel = ctx.lead.channelHints?.[0];
      if (channel) {
        upsert("prefers_channel", channel, 0.65, "heuristic.memory.channel");
      }
      for (const intent of ctx.prior.intents ?? []) {
        upsert(`interested_in_${intent.value}`, intent.value, intent.confidence, intent.source);
      }
      if (ctx.prior.industry?.value) {
        upsert("industry", ctx.prior.industry.value, ctx.prior.industry.confidence, ctx.prior.industry.source);
      }
      const emp = (ctx.prior.buyingSignals ?? []).find((s) => s.type === "mentioned_employees");
      if (emp) {
        upsert("mentioned_employees", "true", emp.confidence, emp.source);
      }

      // Preserve unmatched prior facts (merge not blind overwrite)
      for (const leftover of priorFacts.values()) {
        facts.push(leftover);
      }

      return {
        data: Object.freeze(facts),
        meta: timedMeta("memory", started, `count=${facts.length}`),
      };
    },
  };
}

/** Factory: all 15 heuristic analysis providers (Audit Writer is pipeline callback). */
export function createHeuristicLeadIntelligenceProviders(): LeadIntelligenceProviders {
  return Object.freeze({
    language: createHeuristicLanguageProvider(),
    country: createHeuristicCountryProvider(),
    identity: createHeuristicIdentityProvider(),
    company: createHeuristicCompanyProvider(),
    industry: createHeuristicIndustryProvider(),
    intent: createHeuristicIntentProvider(),
    entity: createHeuristicEntityProvider(),
    summary: createHeuristicSummaryProvider(),
    sentiment: createHeuristicSentimentProvider(),
    buyingSignals: createHeuristicBuyingSignalsProvider(),
    riskSignals: createHeuristicRiskSignalsProvider(),
    temperature: createHeuristicTemperatureProvider(),
    leadScore: createHeuristicLeadScoreProvider(),
    recommendation: createHeuristicRecommendationProvider(),
    memory: createHeuristicMemoryProvider(),
  });
}
