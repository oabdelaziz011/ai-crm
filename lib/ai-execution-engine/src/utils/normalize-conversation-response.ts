type OutputContract = {
  format: "text" | "json";
  instructions?: string;
};

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function extractStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeConversationResponse(
  rawText: string,
  outputContract?: OutputContract,
): string {
  const trimmed = rawText.trim();
  if (!trimmed) return trimmed;

  if (outputContract?.format === "text") {
    return trimmed;
  }

  const parsed = tryParseJson(trimmed);
  if (!parsed) return trimmed;

  const reply = extractStringField(parsed.reply);
  if (reply) return reply;

  const message = extractStringField(parsed.message);
  const status = extractStringField(parsed.status);
  if (message && status === "acknowledged") {
    return message;
  }

  if (message) return message;

  const content = extractStringField(parsed.content);
  if (content) return content;

  return trimmed;
}
