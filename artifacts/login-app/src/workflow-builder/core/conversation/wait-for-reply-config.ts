function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createDefaultWaitForReplyConfig(): Record<string, unknown> {
  return {
    saveAs: "last_reply",
    prompt: "",
  };
}

export function normalizeWaitForReplyNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = createDefaultWaitForReplyConfig();
  const saveAs = readString(config.saveAs) || readString(config.inputKey) || readString(defaults.saveAs);
  const prompt = readString(config.prompt, readString(defaults.prompt));

  return {
    prompt,
    saveAs,
  };
}
