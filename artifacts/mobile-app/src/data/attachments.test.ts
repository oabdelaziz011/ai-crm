import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideAttachment } from "./attachments";

describe("mobile attachments", () => {
  it("rejects an oversized, unnamed, or unsupported file before upload", () => {
    assert.equal(decideAttachment({ bytes: 26_214_401, mime: "image/jpeg", fileName: "big.jpg" }).ok, false);
    assert.equal(decideAttachment({ bytes: 100, mime: "application/x-msdownload", fileName: "run.exe" }).ok, false);
    assert.equal(decideAttachment({ bytes: 100, mime: "image/jpeg", fileName: "../secret.jpg" }).ok, false);
  });

  it("accepts the private conversation attachment types", () => {
    const jpeg = decideAttachment({ bytes: 100, mime: "image/jpeg", fileName: "photo.jpg" });
    const pdf = decideAttachment({ bytes: 100, mime: "application/pdf", fileName: "note.pdf" });
    assert.equal(jpeg.ok, true);
    assert.equal(pdf.ok, true);
  });
});
