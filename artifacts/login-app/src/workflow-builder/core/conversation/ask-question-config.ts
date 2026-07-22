function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createDefaultAskQuestionConfig(): Record<string, unknown> {
  return {
    question: "What is your name?",
    saveAs: "customer_name",
    required: true,
    placeholder: "Type your name",
    validationMessage: "Please enter your name to continue.",
  };
}

export function normalizeAskQuestionNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = createDefaultAskQuestionConfig();
  const question = readString(config.question) || readString(config.prompt) || readString(defaults.question);
  const saveAs = readString(config.saveAs) || readString(config.inputKey) || readString(defaults.saveAs);

  return {
    question,
    saveAs,
    required: typeof config.required === "boolean" ? config.required : defaults.required,
    placeholder: readString(config.placeholder, readString(defaults.placeholder)),
    validationMessage: readString(config.validationMessage, readString(defaults.validationMessage)),
  };
}
