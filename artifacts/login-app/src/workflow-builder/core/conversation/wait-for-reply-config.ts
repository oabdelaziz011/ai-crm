import { readBilingualMap } from "./bilingual-text";

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createDefaultWaitForReplyConfig(): Record<string, unknown> {
  return {
    saveAs: "last_reply",
    prompt: "",
    prompts: { ar: "", en: "" },
  };
}

export function normalizeWaitForReplyNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const defaults = createDefaultWaitForReplyConfig();
  const saveAs = readString(config.saveAs) || readString(config.inputKey) || readString(defaults.saveAs);
  const { ar, en } = readBilingualMap(config, "prompts", "prompt", ["messages", "questions"], ["message", "question"]);
  const prompt = ar.trim() || en.trim() || readString(config.prompt, readString(defaults.prompt));

  return {
    prompt,
    prompts: { ar, en },
    saveAs,
  };
}
