import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../middleware/error-handler.js";
import {
  OMNICHANNEL_REPLY_PERMISSIONS,
  assertOmnichannelReplyPermission,
} from "./omnichannel-reply-permission.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ctx(opts: {
  isSuperAdmin?: boolean;
  permissions?: string[];
}) {
  const granted = new Set(opts.permissions ?? []);
  return {
    isSuperAdmin: Boolean(opts.isSuperAdmin),
    hasPermission: (code: string) => granted.has(code),
  };
}

describe("assertOmnichannelReplyPermission", () => {
  it("allows conversation.reply only", () => {
    assert.doesNotThrow(() =>
      assertOmnichannelReplyPermission(ctx({ permissions: ["conversation.reply"] })),
    );
  });

  it("allows ai.conversations.reply only", () => {
    assert.doesNotThrow(() =>
      assertOmnichannelReplyPermission(ctx({ permissions: ["ai.conversations.reply"] })),
    );
  });

  it("rejects when neither reply permission is present", () => {
    assert.throws(
      () => assertOmnichannelReplyPermission(ctx({ permissions: ["conversation.view"] })),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "forbidden");
        assert.match(error.message, /conversation\.reply permission is required/);
        return true;
      },
    );
  });

  it("allows super admin without reply permissions", () => {
    assert.doesNotThrow(() =>
      assertOmnichannelReplyPermission(ctx({ isSuperAdmin: true, permissions: [] })),
    );
  });

  it("accepts exactly the dual reply permission set", () => {
    assert.deepEqual([...OMNICHANNEL_REPLY_PERMISSIONS], [
      "conversation.reply",
      "ai.conversations.reply",
    ]);
  });
});

describe("omnichannel outbound dispatch reply auth contract", () => {
  it("routes outbound dispatch through assertOmnichannelReplyPermission", () => {
    const routeSrc = readFileSync(join(__dirname, "../routes/omnichannel.ts"), "utf8");
    assert.match(routeSrc, /assertOmnichannelReplyPermission/);
    assert.doesNotMatch(
      routeSrc,
      /if\s*\(\s*!ctx\.isSuperAdmin\s*&&\s*!ctx\.hasPermission\("conversation\.reply"\)\s*\)/,
    );
  });
});
