/**
 * Resolve bilingual copy on interactive / message nodes from conversation.language.
 */

import type { ConversationLanguage } from "./conversation-language.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickLocalizedString(
  language: ConversationLanguage | null | undefined,
  options: {
    base?: unknown;
    ar?: unknown;
    en?: unknown;
    map?: unknown;
  },
): string | null {
  const map =
    options.map && typeof options.map === "object" && !Array.isArray(options.map)
      ? (options.map as Record<string, unknown>)
      : null;
  const ar = readString(options.ar) ?? readString(map?.ar) ?? readString(map?.Arabic);
  const en = readString(options.en) ?? readString(map?.en) ?? readString(map?.English);
  const base = readString(options.base);

  if (language === "ar") return ar ?? base ?? en;
  if (language === "en") return en ?? base ?? ar;
  // Language unknown: prefer explicit bilingual fields over a possibly stale base label.
  return ar ?? en ?? base;
}

export function localizeMessageText(
  config: Record<string, unknown>,
  language: ConversationLanguage | null | undefined,
): string | null {
  return pickLocalizedString(language, {
    base: config.message ?? config.text ?? config.prompt ?? config.question,
    ar: config.messageAr ?? config.textAr ?? config.promptAr ?? config.questionAr,
    en: config.messageEn ?? config.textEn ?? config.promptEn ?? config.questionEn,
    map: config.messages ?? config.prompts ?? config.questions,
  });
}

export function localizeListCopy(
  config: Record<string, unknown>,
  language: ConversationLanguage | null | undefined,
): { title: string | null; body: string | null; buttonLabel: string | null } {
  return {
    title: pickLocalizedString(language, {
      base: config.title,
      ar: config.titleAr,
      en: config.titleEn,
      map: config.titles,
    }),
    body: pickLocalizedString(language, {
      base: config.body,
      ar: config.bodyAr,
      en: config.bodyEn,
      map: config.bodies,
    }),
    buttonLabel: pickLocalizedString(language, {
      base: config.buttonLabel,
      ar: config.buttonLabelAr,
      en: config.buttonLabelEn,
      map: config.buttonLabels,
    }),
  };
}

export function localizeButtonLabel(
  button: Record<string, unknown>,
  language: ConversationLanguage | null | undefined,
): string | null {
  return pickLocalizedString(language, {
    base: button.label ?? button.title,
    ar: button.labelAr ?? button.titleAr,
    en: button.labelEn ?? button.titleEn,
    map: button.labels,
  });
}

/**
 * Returns a shallow-cloned node config with localized message / button labels applied
 * into the standard fields so existing builders keep working.
 *
 * Always resolves bilingual fields (even when language is unset) so edits like
 * spaced Arabic labels are not ignored in favor of a stale English `label`.
 */
export function localizeNodeConfigForLanguage(
  config: Record<string, unknown>,
  language: ConversationLanguage | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config };
  const message = localizeMessageText(config, language);
  if (message) {
    next.message = message;
    next.prompt = message;
    next.question = message;
    if (config.text != null) next.text = message;
  }

  const listCopy = localizeListCopy(config, language);
  if (listCopy.title) next.title = listCopy.title;
  if (listCopy.body) next.body = listCopy.body;
  if (listCopy.buttonLabel) next.buttonLabel = listCopy.buttonLabel;

  if (Array.isArray(config.buttons)) {
    next.buttons = config.buttons.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const button = entry as Record<string, unknown>;
      const label = localizeButtonLabel(button, language);
      return label ? { ...button, label } : button;
    });
  }

  if (Array.isArray(config.sections)) {
    next.sections = config.sections.map((section) => {
      if (!section || typeof section !== "object") return section;
      const sec = section as Record<string, unknown>;
      const sectionTitle = pickLocalizedString(language, {
        base: sec.title,
        ar: sec.titleAr,
        en: sec.titleEn,
        map: sec.titles,
      });
      const rows = Array.isArray(sec.rows)
        ? sec.rows.map((row) => {
            if (!row || typeof row !== "object") return row;
            const record = row as Record<string, unknown>;
            const title = pickLocalizedString(language, {
              base: record.title,
              ar: record.titleAr,
              en: record.titleEn,
              map: record.titles,
            });
            return title ? { ...record, title } : record;
          })
        : sec.rows;
      return {
        ...sec,
        ...(sectionTitle ? { title: sectionTitle } : {}),
        rows,
      };
    });
  }

  return next;
}
