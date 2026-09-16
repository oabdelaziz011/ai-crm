import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_COMPOSER_MAX_ATTACHMENTS,
  EMAIL_COMPOSER_MAX_FILE_BYTES,
  formatEmailAttachmentSize,
  sanitizeEmailAttachmentFilename,
  validateEmailComposerFile,
} from "./email-composer-attachment-validation.ts";

function fakeFile(name: string, size: number, type: string) {
  return { name, size, type };
}

describe("email composer attachment validation", () => {
  it("accepts a small text file with matching MIME and extension", () => {
    const result = validateEmailComposerFile(fakeFile("test-attachment.txt", 24, "text/plain"), 0);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.filename, "test-attachment.txt");
      assert.equal(result.mimeType, "text/plain");
      assert.equal(result.kind, "txt");
    }
  });

  it("accepts png image and maps kind", () => {
    const result = validateEmailComposerFile(fakeFile("photo.png", 1200, "image/png"), 0);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.kind, "image");
      assert.equal(result.mimeType, "image/png");
    }
  });

  it("accepts txt when browser MIME is empty (extension is authoritative with allowlist)", () => {
    const result = validateEmailComposerFile(fakeFile("notes.txt", 10, ""), 0);
    assert.equal(result.ok, true);
  });

  it("rejects MIME/extension mismatch", () => {
    const result = validateEmailComposerFile(fakeFile("notes.txt", 10, "application/pdf"), 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_type");
  });

  it("rejects dangerous executable extension even if MIME looks harmless", () => {
    const result = validateEmailComposerFile(fakeFile("payload.exe", 80, "text/plain"), 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "dangerous_type");
  });

  it("rejects oversized files", () => {
    const result = validateEmailComposerFile(
      fakeFile("huge.txt", EMAIL_COMPOSER_MAX_FILE_BYTES + 1, "text/plain"),
      0,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_large");
  });

  it("rejects more than max files", () => {
    const result = validateEmailComposerFile(
      fakeFile("ok.txt", 8, "text/plain"),
      EMAIL_COMPOSER_MAX_ATTACHMENTS,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_many");
  });

  it("sanitizes path traversal from filenames", () => {
    assert.equal(sanitizeEmailAttachmentFilename("../../etc/passwd.txt"), "passwd.txt");
    assert.equal(sanitizeEmailAttachmentFilename("C:\\\\Windows\\\\evil.txt"), "evil.txt");
    const result = validateEmailComposerFile(fakeFile("../secret.txt", 8, "text/plain"), 0);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.filename, "secret.txt");
  });

  it("formats readable sizes", () => {
    assert.equal(formatEmailAttachmentSize(0), "0 B");
    assert.match(formatEmailAttachmentSize(2048), /KB/);
  });
});
