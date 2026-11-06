/**
 * Maps reused platform errors onto HTTP responses.
 * Assignment governance stays in force. Its denials are business responses,
 * not missing-permission responses and not internal server errors.
 */
import { HttpError } from "../middleware/error-handler.js";

const ASSIGNMENT = /assignment_|ASSIGNMENT_TARGET/i;

function field(error: unknown, key: "code" | "name" | "message"): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function mapMobileServiceError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  const code = field(error, "code");
  const name = field(error, "name");
  const message = field(error, "message");
  if (ASSIGNMENT.test(code) || ASSIGNMENT.test(message) || /ASSIGNEE_NOT_FOUND|ASSIGNEE_AMBIGUOUS/i.test(code)) {
    return new HttpError(403, "The selected employee cannot be assigned.", "assignment_rejected");
  }
  if (/NOT_FOUND/i.test(code) || /NotFound/.test(name)) {
    return new HttpError(404, "Record not found.", "not_found");
  }
  if (/PERMISSION_DENIED/i.test(code) || /PermissionDenied/.test(name)) {
    return new HttpError(403, "Permission denied.", "forbidden");
  }
  if (/VALIDATION|STATUS_TRANSITION/i.test(code) || /Validation/.test(name)) {
    return new HttpError(400, "The record could not be saved.", "validation_error");
  }
  return null;
}
