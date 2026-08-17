import {
  DEFAULT_EMAIL_ROUTING_CATEGORY,
  EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD,
  type EmailRoutingCategory,
} from "./categories.js";
import type { EmailRoutingClassifier } from "./email-classifier-contract.js";
import type { EmailClassificationInput, EmailClassificationResult } from "./types.js";

type CategoryRule = {
  category: EmailRoutingCategory;
  phrases: string[];
  keywords: string[];
  /** Optional subject-only boost phrases (when subject alone strongly signals category). */
  subjectPhrases?: string[];
  baseConfidence: number;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "complaint",
    phrases: [
      "file a complaint",
      "formal complaint",
      "extremely disappointed",
      "worst experience",
      "want a refund immediately",
      "this is unacceptable",
    ],
    keywords: [
      "complaint",
      "complain",
      "disgusted",
      "furious",
      "lawsuit",
      "attorney",
      "refund now",
      "unacceptable",
    ],
    subjectPhrases: ["complaint", "formal complaint", "escalate complaint"],
    baseConfidence: 0.82,
  },
  {
    category: "billing",
    phrases: [
      "invoice number",
      "payment failed",
      "double charged",
      "billing question",
      "update my payment",
      "subscription renewal",
    ],
    keywords: [
      "invoice",
      "billing",
      "payment",
      "refund",
      "charge",
      "receipt",
      "subscription fee",
      "overcharged",
      "credit card",
    ],
    subjectPhrases: ["invoice", "billing", "payment", "refund"],
    baseConfidence: 0.8,
  },
  {
    category: "hr",
    phrases: [
      "job application",
      "apply for the position",
      "human resources",
      "payroll inquiry",
      "leave request",
      "employee onboarding",
    ],
    keywords: [
      "hr",
      "hiring",
      "resume",
      "cv",
      "payroll",
      "benefits",
      "recruitment",
      "interview",
      "job opening",
      "career",
    ],
    subjectPhrases: ["job application", "hr", "resume", "careers"],
    baseConfidence: 0.8,
  },
  {
    category: "sales",
    phrases: [
      "request a quote",
      "pricing information",
      "demo request",
      "interested in purchasing",
      "sales inquiry",
      "enterprise plan",
    ],
    keywords: [
      "quote",
      "pricing",
      "price list",
      "demo",
      "purchase",
      "buy",
      "sales",
      "discount",
      "proposal",
      "trial",
    ],
    subjectPhrases: ["quote", "pricing", "demo", "sales"],
    baseConfidence: 0.78,
  },
  {
    category: "support",
    phrases: [
      "need technical help",
      "not working",
      "cannot login",
      "error message",
      "bug report",
      "how do i",
      "troubleshooting",
    ],
    keywords: [
      "support",
      "help",
      "issue",
      "problem",
      "bug",
      "error",
      "broken",
      "troubleshoot",
      "outage",
      "login",
    ],
    subjectPhrases: ["support", "help needed", "bug", "not working"],
    baseConfidence: 0.76,
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function combineClassifiedText(subject: string, body: string): string {
  if (subject && body) return `${subject}\n${body}`;
  return subject || body;
}

function scoreRule(
  subject: string,
  body: string,
  combined: string,
  rule: CategoryRule,
): { confidence: number; reason: string } | null {
  if (!combined) return null;

  for (const phrase of rule.subjectPhrases ?? []) {
    const p = normalize(phrase);
    if (p && subject.includes(p)) {
      return {
        confidence: Math.min(1, Math.max(rule.baseConfidence, 0.88)),
        reason: `Subject matched phrase "${phrase}"`,
      };
    }
  }

  for (const phrase of rule.phrases) {
    const p = normalize(phrase);
    if (p && combined.includes(p)) {
      return {
        confidence: Math.min(1, Math.max(rule.baseConfidence, 0.9)),
        reason: `Matched phrase "${phrase}"`,
      };
    }
  }

  const matchedKeywords = rule.keywords.filter((keyword) => {
    const k = normalize(keyword);
    return k.length > 0 && combined.includes(k);
  });

  if (matchedKeywords.length === 0) return null;

  const keywordBoost = Math.min(0.22, matchedKeywords.length * 0.07);
  const confidence = Math.min(1, rule.baseConfidence - 0.08 + keywordBoost);

  return {
    confidence,
    reason: `Matched keywords: ${matchedKeywords.slice(0, 5).join(", ")}`,
  };
}

/**
 * Rule-based AI Email Routing classifier (Sprint 1).
 * Considers subject + body. Falls back to general_inquiry with low confidence.
 */
export class RuleBasedEmailRoutingClassifier implements EmailRoutingClassifier {
  readonly source = "rule_based" as const;

  async classify(input: EmailClassificationInput): Promise<EmailClassificationResult> {
    const subject = normalize(input.subject);
    const body = normalize(input.body);
    const combined = combineClassifiedText(subject, body);
    const preview = combined.slice(0, 240);

    if (!combined) {
      return {
        category: DEFAULT_EMAIL_ROUTING_CATEGORY,
        confidence: 0.1,
        subcategory: null,
        reason: "Empty subject and body; defaulting to general_inquiry",
        source: this.source,
        classifiedTextPreview: "",
      };
    }

    let best: {
      category: EmailRoutingCategory;
      confidence: number;
      reason: string;
    } | null = null;

    for (const rule of CATEGORY_RULES) {
      const score = scoreRule(subject, body, combined, rule);
      if (!score) continue;
      if (!best || score.confidence > best.confidence) {
        best = {
          category: rule.category,
          confidence: score.confidence,
          reason: score.reason,
        };
      }
    }

    if (!best || best.confidence < EMAIL_ROUTING_LOW_CONFIDENCE_THRESHOLD) {
      return {
        category: DEFAULT_EMAIL_ROUTING_CATEGORY,
        confidence: best ? Math.min(best.confidence, 0.35) : 0.2,
        subcategory: null,
        reason: best
          ? `Low confidence (${best.category}: ${best.reason}); falling back to general_inquiry`
          : "No category rules matched; defaulting to general_inquiry",
        source: this.source,
        classifiedTextPreview: preview,
      };
    }

    return {
      category: best.category,
      confidence: best.confidence,
      subcategory: null,
      reason: best.reason,
      source: this.source,
      classifiedTextPreview: preview,
    };
  }
}

export function createRuleBasedEmailRoutingClassifier(): RuleBasedEmailRoutingClassifier {
  return new RuleBasedEmailRoutingClassifier();
}
