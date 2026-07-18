import type { ConversationState } from "@workspace/ai-conversation";
import { ToolInputValidationError } from "../errors.js";
import type { JsonSchema } from "../types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAgainstSchema(schema: JsonSchema, input: Record<string, unknown>): void {
  if (!isPlainObject(input)) {
    throw new ToolInputValidationError("Tool input must be an object.");
  }

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const field of required) {
    if (!(field in input) || input[field] === undefined || input[field] === null) {
      throw new ToolInputValidationError(`Missing required field: ${field}`);
    }
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  for (const [key, value] of Object.entries(input)) {
    const propertySchema = properties[key];
    if (!propertySchema || !isPlainObject(propertySchema)) continue;

    const expectedType = propertySchema.type;
    if (typeof expectedType !== "string") continue;

    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (expectedType === "string" && actualType !== "string") {
      throw new ToolInputValidationError(`Field ${key} must be a string.`);
    }
    if (expectedType === "boolean" && actualType !== "boolean") {
      throw new ToolInputValidationError(`Field ${key} must be a boolean.`);
    }
    if (expectedType === "number" && actualType !== "number") {
      throw new ToolInputValidationError(`Field ${key} must be a number.`);
    }
    if (expectedType === "array" && actualType !== "array") {
      throw new ToolInputValidationError(`Field ${key} must be an array.`);
    }
    if (expectedType === "object" && actualType !== "object") {
      throw new ToolInputValidationError(`Field ${key} must be an object.`);
    }
  }
}

export function supportsConversationState(
  supportedStates: ConversationState[],
  state: ConversationState,
): boolean {
  if (supportedStates.length === 0) return true;
  return supportedStates.includes(state);
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
