import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAvatarDisplayUrl } from "./avatar-url.ts";

describe("resolveAvatarDisplayUrl", () => {
  it("returns undefined when no avatar is set (initials fallback path)", () => {
    assert.equal(resolveAvatarDisplayUrl(null), undefined);
    assert.equal(resolveAvatarDisplayUrl(""), undefined);
    assert.equal(resolveAvatarDisplayUrl("   "), undefined);
  });

  it("passes through https profile image urls", () => {
    const url = "https://cdn.example.com/avatars/oa.png";
    assert.equal(resolveAvatarDisplayUrl(url), url);
  });

  it("resolves storage paths via public url builder", () => {
    const resolved = resolveAvatarDisplayUrl("avatars/user-1/photo.png", (path) => {
      assert.equal(path, "avatars/user-1/photo.png");
      return `https://storage.test/${path}`;
    });
    assert.equal(resolved, "https://storage.test/avatars/user-1/photo.png");
  });
});
