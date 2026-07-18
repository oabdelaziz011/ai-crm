import { catalogEntries, mapErrorCode, normalizeError } from "../utils/error-utils.js";
import type { AIErrorCatalogCode } from "../constants.js";
import type { NormalizedError } from "../types.js";

export class ErrorCatalogService {
  normalize(error: unknown): NormalizedError {
    return normalizeError(error);
  }

  mapCode(sourceCode: string): AIErrorCatalogCode {
    return mapErrorCode(sourceCode);
  }

  catalog(): Array<{ code: AIErrorCatalogCode; description: string }> {
    return catalogEntries();
  }
}
