import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WA_BP_ABOUT_MAX,
  WA_BP_WEBSITE_MAX_COUNT,
  draftWebsites,
  draftsEqual,
  isHttpUrl,
  profileToDraft,
  validateBusinessProfileDraft,
  validateProfilePictureFileMeta,
  type WhatsAppBusinessProfileDraft,
} from "./whatsapp-business-profile-form.ts";
function baseDraft(
  overrides: Partial<WhatsAppBusinessProfileDraft> = {},
): WhatsAppBusinessProfileDraft {
  return {
    about: "About text",
    address: "",
    description: "",
    email: "",
    website1: "",
    website2: "",
    vertical: "OTHER",
    showWebsite2: false,
    ...overrides,
  };
}

describe("whatsapp-business-profile form helpers", () => {
  it("maps Meta profile into draft and caps websites at two", () => {
    const profile = {
      about: "Hello",
      address: "Cairo",
      description: "Desc",
      email: "a@b.com",
      websites: ["https://one.example", "https://two.example", "https://three.example"],
      vertical: "RETAIL",
    };
    const draft = profileToDraft(profile);
    assert.equal(draft.about, "Hello");
    assert.equal(draft.website1, "https://one.example");
    assert.equal(draft.website2, "https://two.example");
    assert.equal(draft.showWebsite2, true);
    assert.equal(draftWebsites(draft).length, WA_BP_WEBSITE_MAX_COUNT);
  });

  it("detects dirty draft changes", () => {
    const a = baseDraft();
    const b = baseDraft({ about: "Changed" });
    assert.equal(draftsEqual(a, a), true);
    assert.equal(draftsEqual(a, b), false);
  });

  it("enforces About required and character limit", () => {
    assert.equal(validateBusinessProfileDraft(baseDraft({ about: "" })).about, "aboutRequired");
    assert.equal(
      validateBusinessProfileDraft(baseDraft({ about: "x".repeat(WA_BP_ABOUT_MAX + 1) })).about,
      "aboutTooLong",
    );
    assert.equal(validateBusinessProfileDraft(baseDraft()).about, undefined);
  });

  it("validates email format and website HTTP/HTTPS URLs", () => {
    assert.equal(
      validateBusinessProfileDraft(baseDraft({ email: "not-an-email" })).email,
      "emailInvalid",
    );
    assert.equal(isHttpUrl("https://valueor.com"), true);
    assert.equal(isHttpUrl("ftp://valueor.com"), false);
    assert.equal(
      validateBusinessProfileDraft(baseDraft({ website1: "ftp://x.com" })).website1,
      "websiteInvalid",
    );
    assert.equal(
      validateBusinessProfileDraft(
        baseDraft({ showWebsite2: true, website2: "https://ok.example" }),
      ).website2,
      undefined,
    );
  });

  it("rejects unsupported vertical enum values", () => {
    assert.equal(
      validateBusinessProfileDraft(baseDraft({ vertical: "NOT_A_REAL_VERTICAL" })).vertical,
      "verticalInvalid",
    );
  });

  it("validates profile picture mime/size/square dimensions", () => {
    assert.equal(
      validateProfilePictureFileMeta({
        mimeType: "image/gif",
        sizeBytes: 1000,
        width: 640,
        height: 640,
      }),
      "imageUnsupported",
    );
    assert.equal(
      validateProfilePictureFileMeta({
        mimeType: "image/png",
        sizeBytes: 6 * 1024 * 1024,
        width: 640,
        height: 640,
      }),
      "imageTooLarge",
    );
    assert.equal(
      validateProfilePictureFileMeta({
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        width: 640,
        height: 480,
      }),
      "imageInvalid",
    );
    assert.equal(
      validateProfilePictureFileMeta({
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        width: 640,
        height: 640,
      }),
      null,
    );
  });
});
