import { readBilingualMap } from "./bilingual-text";

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createDefaultAskQuestionConfig(): Record<string, unknown> {
  return {
    question: "",
    questions: {
      ar: "",
      en: "",
    },
    saveAs: "",
    required: true,
    placeholder: "",
    validationMessage: "",
  };
}

export function normalizeAskQuestionNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = createDefaultAskQuestionConfig();
  const { ar, en } = readBilingualMap(
    config,
    "questions",
    "question",
    ["prompts", "messages"],
    ["prompt", "message"],
  );
  const question = ar.trim() || en.trim() || readString(defaults.question);
  const saveAs = readString(config.saveAs) || readString(config.inputKey) || "";

  return {
    question,
    questions: { ar, en },
    saveAs,
    required: typeof config.required === "boolean" ? config.required : defaults.required,
    placeholder: readString(config.placeholder, readString(defaults.placeholder)),
    validationMessage: readString(config.validationMessage, readString(defaults.validationMessage)),
  };
}
