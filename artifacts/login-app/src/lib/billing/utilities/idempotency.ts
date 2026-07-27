import { randomUUID } from "@/lib/billing/utilities/random-id";

export function buildIdempotencyKey(prefix: string, parts: string[]): string {
  return `${prefix}:${parts.filter(Boolean).join(":")}`;
}

export function generateIdempotencyKey(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}
