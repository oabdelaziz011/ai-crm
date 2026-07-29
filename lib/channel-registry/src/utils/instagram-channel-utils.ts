import { randomUUID } from "node:crypto";

export function readInstagramBusinessAccountId(configuration: Record<string, unknown>): string | null {
  const value = configuration.instagramBusinessAccountId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function readInstagramPageId(configuration: Record<string, unknown>): string | null {
  const value = configuration.pageId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function generateInstagramVerifyToken(): string {
  return `ig_verify_${randomUUID().replace(/-/g, "")}`;
}
