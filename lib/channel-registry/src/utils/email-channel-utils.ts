export function readEmailFromAddress(configuration: Record<string, unknown>): string | null {
  const value = configuration.fromEmail;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function readEmailReplyToAddress(configuration: Record<string, unknown>): string | null {
  const value = configuration.replyToEmail;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}
