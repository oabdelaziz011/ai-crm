import { randomUUID } from "node:crypto";

export function readMessengerPageId(configuration: Record<string, unknown>): string | null {
  const value = configuration.pageId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function generateMessengerVerifyToken(): string {
  return `messenger_verify_${randomUUID().replace(/-/g, "")}`;
}
