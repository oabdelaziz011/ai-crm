/**
 * Deterministic, local language detection for acknowledgement templates.
 * No AI / LLM / external APIs.
 *
 * Uses weighted phrase/keyword scoring so short real-world greetings
 * (Guten Morgen, Bonjour, Hola, مساء الخير, Good morning) resolve correctly
 * without classifying every Latin email as English.
 */

import { normalizeLanguageCode } from "./email-acknowledgement-config.js";

const ARABIC_RE = /[\u0600-\u06FF]/g;
const LATIN_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;

type WeightedMarker = {
  /** Lowercase phrase / token to search for (substring match on normalized text). */
  phrase: string;
  /** Higher weight = stronger language signal. Strong greetings are >= 3. */
  weight: number;
};

const FR_MARKERS: readonly WeightedMarker[] = [
  { phrase: "bonjour", weight: 3 },
  { phrase: "bonsoir", weight: 3 },
  { phrase: "comment allez-vous", weight: 3 },
  { phrase: "comment allez vous", weight: 3 },
  { phrase: "je voudrais", weight: 3 },
  { phrase: "j'aimerais", weight: 3 },
  { phrase: "aimerais", weight: 2 },
  { phrase: "s'il vous plaît", weight: 3 },
  { phrase: "sil vous plait", weight: 3 },
  { phrase: "merci beaucoup", weight: 3 },
  { phrase: "merci pour", weight: 3 },
  { phrase: "merci", weight: 2 },
  { phrase: "cordialement", weight: 2 },
  { phrase: "veuillez", weight: 2 },
  { phrase: "pouvez-vous", weight: 2 },
  { phrase: "nous avons", weight: 2 },
  { phrase: "votre message", weight: 2 },
  { phrase: "votre service", weight: 2 },
  { phrase: "madame", weight: 1 },
  { phrase: "monsieur", weight: 1 },
  { phrase: "demande", weight: 1 },
  { phrase: "beaucoup", weight: 1 },
  { phrase: "votre", weight: 1 },
  { phrase: " vous ", weight: 1 },
];

const DE_MARKERS: readonly WeightedMarker[] = [
  { phrase: "guten morgen", weight: 3 },
  { phrase: "guten tag", weight: 3 },
  { phrase: "guten abend", weight: 3 },
  { phrase: "wie geht es", weight: 3 },
  { phrase: "wie geht's", weight: 3 },
  { phrase: "wie gehts", weight: 3 },
  { phrase: "vielen dank", weight: 3 },
  { phrase: "sehr geehrte", weight: 3 },
  { phrase: "mit freundlichen", weight: 3 },
  { phrase: "könnten sie", weight: 3 },
  { phrase: "koennten sie", weight: 3 },
  { phrase: "ich möchte", weight: 3 },
  { phrase: "ich moechte", weight: 3 },
  { phrase: "würden sie", weight: 2 },
  { phrase: "wuerden sie", weight: 2 },
  { phrase: "ihre nachricht", weight: 3 },
  { phrase: "ihr service", weight: 2 },
  { phrase: "ihrem service", weight: 2 },
  { phrase: "hallo", weight: 2 },
  { phrase: "bitte", weight: 2 },
  { phrase: "danke", weight: 2 },
  { phrase: "anfrage", weight: 2 },
  { phrase: "wir haben", weight: 2 },
  { phrase: "können sie", weight: 2 },
  { phrase: "koennen sie", weight: 2 },
  { phrase: "möchte", weight: 2 },
  { phrase: "moechte", weight: 2 },
  { phrase: "würde", weight: 1 },
  { phrase: "wuerde", weight: 1 },
  { phrase: "ihre", weight: 1 },
  { phrase: "ihrem", weight: 1 },
  { phrase: "nachricht", weight: 1 },
];

const ES_MARKERS: readonly WeightedMarker[] = [
  { phrase: "buenos días", weight: 3 },
  { phrase: "buenos dias", weight: 3 },
  { phrase: "buenas tardes", weight: 3 },
  { phrase: "buenas noches", weight: 3 },
  { phrase: "cómo estás", weight: 3 },
  { phrase: "como estas", weight: 3 },
  { phrase: "cómo está", weight: 3 },
  { phrase: "como esta", weight: 3 },
  { phrase: "me gustaría", weight: 3 },
  { phrase: "me gustaria", weight: 3 },
  { phrase: "por favor", weight: 3 },
  { phrase: "gracias por", weight: 3 },
  { phrase: "hola", weight: 3 },
  { phrase: "gracias", weight: 2 },
  { phrase: "quisiera", weight: 2 },
  { phrase: "estimado", weight: 2 },
  { phrase: "necesitamos", weight: 2 },
  { phrase: "saludos", weight: 2 },
  { phrase: "su mensaje", weight: 2 },
  { phrase: "su servicio", weight: 2 },
  { phrase: "solicitud", weight: 2 },
  { phrase: "servicio", weight: 1 },
];

const EN_MARKERS: readonly WeightedMarker[] = [
  { phrase: "good morning", weight: 3 },
  { phrase: "good afternoon", weight: 3 },
  { phrase: "good evening", weight: 3 },
  { phrase: "thank you", weight: 3 },
  { phrase: "looking forward", weight: 3 },
  { phrase: "could you", weight: 2 },
  { phrase: "i would like", weight: 2 },
  { phrase: "i need", weight: 2 },
  { phrase: "we need", weight: 2 },
  { phrase: "hello", weight: 2 },
  { phrase: "thanks", weight: 2 },
  { phrase: "please", weight: 2 },
  { phrase: "regarding", weight: 2 },
  { phrase: "hi ", weight: 1 },
  { phrase: "your service", weight: 1 },
];

export type EmailAckLanguageDetection = {
  language: string | null;
  confidence: number;
  reason: string;
  /** Optional debug scores for tests/diagnostics (never required by callers). */
  scores?: Record<string, number>;
};

/** Strip HTML, quoted replies, and common signature separators for detection. */
export function prepareAcknowledgementDetectionText(input: {
  subject?: string | null;
  textPlain?: string | null;
  html?: string | null;
}): string {
  const subject = String(input.subject ?? "").trim();
  let body = String(input.textPlain ?? "").trim();
  if (!body && input.html) {
    body = String(input.html)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^>/.test(trimmed)) continue;
    if (/^on .+ wrote:$/i.test(trimmed)) break;
    if (/^from:\s+/i.test(trimmed) && /sent:\s+/i.test(body)) break;
    if (/^-{2,}\s*original message\s*-{2,}/i.test(trimmed)) break;
    if (/^_{5,}$/.test(trimmed)) break;
    if (/^--\s*$/.test(trimmed)) break;
    if (/^sent from my /i.test(trimmed)) break;
    kept.push(trimmed);
  }

  return [subject, kept.join("\n")].filter(Boolean).join("\n").trim();
}

function normalizeForMatching(text: string): string {
  return ` ${String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function normalizeMarkerPhrase(phrase: string): string {
  return String(phrase ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreWeightedMarkers(
  normalizedText: string,
  markers: readonly WeightedMarker[],
): number {
  let score = 0;
  const hitPhrases = new Set<string>();
  const ordered = [...markers]
    .map((marker) => ({
      phrase: normalizeMarkerPhrase(marker.phrase),
      weight: marker.weight,
    }))
    .filter((marker) => marker.phrase.length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const marker of ordered) {
    if (hitPhrases.has(marker.phrase)) continue;
    if (!normalizedText.includes(marker.phrase)) continue;

    let covered = false;
    for (const hit of hitPhrases) {
      if (hit.includes(marker.phrase) && hit !== marker.phrase) {
        covered = true;
        break;
      }
    }
    if (covered) continue;
    hitPhrases.add(marker.phrase);
    score += marker.weight;
  }
  return score;
}

/**
 * Detect language from subject + body text only (never from addresses / UI locale).
 * Supports ar/en/fr/de/es with script + weighted keyword heuristics.
 */
export function detectAcknowledgementLanguage(text: string): EmailAckLanguageDetection {
  const cleaned = String(text ?? "").trim();
  if (!cleaned) {
    return { language: null, confidence: 0, reason: "empty_text", scores: {} };
  }

  const compact = cleaned.replace(/\s+/g, "");
  const arabic = (compact.match(ARABIC_RE) ?? []).join("").length;
  const latin = (compact.match(LATIN_RE) ?? []).join("").length;
  const total = arabic + latin;

  if (total === 0) {
    return { language: null, confidence: 0.2, reason: "no_alpha_script", scores: {} };
  }

  const arRatio = arabic / total;
  if (arRatio >= 0.45) {
    return {
      language: "ar",
      confidence: Math.min(0.95, 0.55 + arRatio * 0.4),
      reason: "arabic_script",
      scores: { ar: Math.round(arRatio * 100) },
    };
  }

  if (latin / total < 0.4) {
    return { language: null, confidence: 0.35, reason: "insufficient_latin", scores: {} };
  }

  const normalized = normalizeForMatching(cleaned);
  const fr = scoreWeightedMarkers(normalized, FR_MARKERS);
  const de = scoreWeightedMarkers(normalized, DE_MARKERS);
  const es = scoreWeightedMarkers(normalized, ES_MARKERS);
  const en = scoreWeightedMarkers(normalized, EN_MARKERS);
  const scores = { fr, de, es, en };

  const ranked = [
    { language: "fr", score: fr },
    { language: "de", score: de },
    { language: "es", score: es },
    { language: "en", score: en },
  ].sort((a, b) => b.score - a.score);

  const best = ranked[0]!;
  const second = ranked[1]?.score ?? 0;

  // Strong phrase alone (weight >= 3) or clear lead with total weight >= 2.
  const clearWinner =
    (best.score >= 3 && best.score > second) ||
    (best.score >= 2 && best.score >= second + 2) ||
    (best.score >= 2 && best.score > second && best.score >= 4);

  if (clearWinner) {
    return {
      language: best.language,
      confidence: Math.min(0.95, 0.58 + best.score * 0.06),
      reason: best.score >= 3 && second === 0 ? "latin_strong_phrase" : "latin_keyword",
      scores,
    };
  }

  // Tie / weak Latin → do NOT force English; let defaultLanguage handle ambiguity.
  if (best.score === 0 || best.score === second) {
    return {
      language: null,
      confidence: 0.4,
      reason: best.score === 0 ? "latin_ambiguous" : "latin_tie",
      scores,
    };
  }

  // Single weak marker (score 1): too weak to override defaultLanguage.
  return {
    language: null,
    confidence: 0.45,
    reason: "latin_weak_signal",
    scores,
  };
}

export function resolveAcknowledgementLanguageOrNull(
  detection: EmailAckLanguageDetection,
  minConfidence = 0.5,
): string | null {
  const language = normalizeLanguageCode(detection.language);
  if (!language) return null;
  if (detection.confidence < minConfidence) return null;
  return language;
}
