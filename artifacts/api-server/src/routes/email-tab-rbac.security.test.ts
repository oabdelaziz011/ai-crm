import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_CONNECTION_PERMISSION,
  EMAIL_SETTINGS_TAB_PERMISSION,
  EMAIL_TEMPLATES_TAB_PERMISSION,
} from "../lib/email-tab-permissions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const emailSrc = readFileSync(join(__dirname, "email.ts"), "utf8");
const mailboxSrc = readFileSync(join(__dirname, "email-mailbox-provider.ts"), "utf8");
const channelSrc = readFileSync(join(__dirname, "email-channel.ts"), "utf8");
const permsSrc = readFileSync(
  join(__dirname, "../lib/email-tab-permissions.ts"),
  "utf8",
);

describe("email tab API authorization contract", () => {
  it("connection routes require email.settings.manage only", () => {
    assert.equal(EMAIL_SETTINGS_TAB_PERMISSION, "ai.email.manage");
    assert.equal(EMAIL_CONNECTION_PERMISSION, "email.settings.manage");
    assert.match(permsSrc, /EMAIL_CONNECTION_PERMISSION = "email.settings.manage"/);
    assert.doesNotMatch(permsSrc, /EMAIL_CONNECTION_PERMISSION_ANY/);
    assert.match(emailSrc, /EMAIL_CONNECTION_PERMISSION/);
    assert.match(emailSrc, /requireRequestCompanyPermission/);
    assert.doesNotMatch(emailSrc, /EMAIL_CONNECTION_PERMISSION_ANY/);
    assert.doesNotMatch(emailSrc, /requireRequestAnyCompanyPermission/);
    assert.match(emailSrc, /\/email\/health/);
    assert.match(emailSrc, /\/email\/test-connection/);
    assert.match(mailboxSrc, /EMAIL_CONNECTION_PERMISSION/);
    assert.match(mailboxSrc, /requireRequestCompanyPermission/);
    assert.doesNotMatch(mailboxSrc, /EMAIL_CONNECTION_PERMISSION_ANY/);
    assert.match(channelSrc, /EMAIL_CONNECTION_PERMISSION/);
    assert.match(channelSrc, /requireRequestCompanyPermission/);
    assert.doesNotMatch(channelSrc, /EMAIL_CONNECTION_PERMISSION_ANY/);
  });

  it("template test-send requires email.templates.view, not settings.edit", () => {
    assert.equal(EMAIL_TEMPLATES_TAB_PERMISSION, "email.templates.view");
    assert.match(emailSrc, /EMAIL_TEMPLATES_TAB_PERMISSION/);
    assert.doesNotMatch(emailSrc, /settings\.edit permission is required/);
  });
});
