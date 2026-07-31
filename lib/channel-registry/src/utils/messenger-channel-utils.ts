import { createSecureRandomId } from "./secure-random-id.js";

export function readMessengerPageId(configuration: Record<string, unknown>): string | null {
  const value = configuration.pageId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function generateMessengerVerifyToken(): string {
  return `messenger_verify_${createSecureRandomId().replace(/-/g, "")}`;
}
