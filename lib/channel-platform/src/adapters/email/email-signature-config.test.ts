import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyEmailSignatureConfig,
  hasEmailSignatureConfig,
  isValidSignatureEmail,
  isValidSignatureWebsite,
  normalizeEmailSignatureConfig,
  normalizeSignatureWebsiteHref,
  plainTextFromLegacySignature,
  renderEmailSignatureHtml,
} from "./email-signature-config.js";

describe("email signature config", () => {
  it("empty config has no signature", () => {
    assert.equal(hasEmailSignatureConfig(emptyEmailSignatureConfig()), false);
    assert.equal(renderEmailSignatureHtml(emptyEmailSignatureConfig()), "");
    assert.equal(renderEmailSignatureHtml(""), "");
    assert.equal(renderEmailSignatureHtml("   "), "");
    assert.equal(renderEmailSignatureHtml(null), "");
  });

  it("legacy string becomes name only", () => {
    const config = normalizeEmailSignatureConfig("ValueOR Support");
    assert.deepEqual(config, {
      name: "ValueOR Support",
      title: "",
      email: "",
      website: "",
      colors: {
        name: "#111827",
        title: "#111827",
        email: "#111827",
        website: "#111827",
      },
    });
    assert.equal(hasEmailSignatureConfig(config), true);
    const html = renderEmailSignatureHtml(config);
    assert.match(html, /ValueOR Support/);
    assert.doesNotMatch(html, /Customer Success Team/);
    assert.doesNotMatch(html, /support@valueor\.com/);
    assert.doesNotMatch(html, /www\.valueor\.com/);
  });

  it("legacy HTML string strips to plain name", () => {
    assert.equal(
      plainTextFromLegacySignature("<p>Best regards,<br/>ValueOR Support</p>"),
      "Best regards, ValueOR Support",
    );
    const config = normalizeEmailSignatureConfig(
      "<p>Best regards,<br/>ValueOR Support</p>",
    );
    assert.equal(config.name, "Best regards, ValueOR Support");
    assert.equal(config.title, "");
  });

  it("name only renders one line", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Support",
      title: "",
      email: "",
      website: "",
    });
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 1);
    assert.match(html, /ValueOR Support/);
  });

  it("name + title renders two lines without blank separators", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Support",
      title: "Customer Success Team",
      email: "",
      website: "",
    });
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 2);
    assert.match(html, /Customer Success Team/);
    assert.doesNotMatch(html, /<div style="[^"]*">\s*<\/div>/);
  });

  it("name + email", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Support",
      title: "",
      email: "support@valueor.com",
      website: "",
    });
    assert.match(html, /mailto:support@valueor\.com/);
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 2);
  });

  it("name + website", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Support",
      title: "",
      email: "",
      website: "www.valueor.com",
    });
    assert.match(html, /www\.valueor\.com/);
    assert.match(html, /href="https:\/\/www\.valueor\.com\/?"/);
  });

  it("all four fields", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Customer Care",
      title: "Customer Success Team",
      email: "support@valueor.com",
      website: "www.valueor.com",
    });
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 4);
    assert.match(html, /ValueOR Customer Care/);
    assert.match(html, /Customer Success Team/);
    assert.match(html, /support@valueor\.com/);
    assert.match(html, /www\.valueor\.com/);
  });

  it("empty optional fields produce no blank lines", () => {
    const html = renderEmailSignatureHtml({
      name: "Only Name",
      title: "  ",
      email: "",
      website: "\t",
    });
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 1);
  });

  it("escapes unsafe HTML in fields", () => {
    const html = renderEmailSignatureHtml({
      name: `<script>alert(1)</script>`,
      title: `Team<img src=x onerror=alert(1)>`,
      email: "ok@example.com",
      website: "example.com",
    });
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /<img\b/i);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  it("validates email and website", () => {
    assert.equal(isValidSignatureEmail(""), true);
    assert.equal(isValidSignatureEmail("a@b.co"), true);
    assert.equal(isValidSignatureEmail("bad"), false);
    assert.equal(isValidSignatureWebsite(""), true);
    assert.equal(isValidSignatureWebsite("www.valueor.com"), true);
    assert.equal(isValidSignatureWebsite("javascript:alert(1)"), false);
    assert.equal(normalizeSignatureWebsiteHref("valueor.com"), "https://valueor.com/");
  });

  it("does not invent Customer Success / support@ / www defaults from legacy name", () => {
    const config = normalizeEmailSignatureConfig("ValueOR Support");
    assert.equal(config.title, "");
    assert.equal(config.email, "");
    assert.equal(config.website, "");
  });

  it("fills default colors when structured signature omits colors", () => {
    const config = normalizeEmailSignatureConfig({
      name: "ValueOR Support",
      title: "Support Team",
      email: "support@valueor.com",
      website: "www.valueor.org",
    });
    assert.deepEqual(config.colors, {
      name: "#111827",
      title: "#111827",
      email: "#111827",
      website: "#111827",
    });
  });

  it("persists per-field signature colors", () => {
    const persisted = normalizeEmailSignatureConfig({
      name: "ValueOR Support",
      title: "Support Team",
      email: "support@valueor.com",
      website: "www.valueor.org",
      colors: {
        name: "#123456",
        title: "#654321",
        email: "#0F9F9A",
        website: "#7C3AED",
      },
    });
    assert.equal(persisted.colors.name, "#123456");
    assert.equal(persisted.colors.title, "#654321");
    assert.equal(persisted.colors.email, "#0F9F9A");
    assert.equal(persisted.colors.website, "#7C3AED");
  });

  it("renders configured field colors as inline CSS", () => {
    const html = renderEmailSignatureHtml({
      name: "ValueOR Support",
      title: "Support Team",
      email: "support@valueor.com",
      website: "www.valueor.org",
      colors: {
        name: "#123456",
        title: "#654321",
        email: "#0F9F9A",
        website: "#7C3AED",
      },
    });
    assert.match(html, /<font color="#123456" style="color:#123456;">ValueOR Support<\/font>/);
    assert.match(html, /<font color="#654321" style="color:#654321;">Support Team<\/font>/);
    assert.match(html, /<font color="#0F9F9A"[^>]*>support@valueor\.com<\/font>/);
    assert.match(html, /<font color="#7C3AED"[^>]*>www\.valueor\.org<\/font>/);
    assert.match(html, /<div style="[^"]*color:#123456;"/);
    assert.match(html, /<div style="[^"]*color:#654321;"/);
    assert.match(html, /<div style="[^"]*color:#0F9F9A;"/);
    assert.match(html, /<div style="[^"]*color:#7C3AED;"/);
    assert.equal((html.match(/<div style="margin:0/g) ?? []).length, 4);
  });

  it("rejects unsafe color values and falls back", () => {
    const config = normalizeEmailSignatureConfig({
      name: "Safe",
      colors: {
        name: "javascript:alert(1)",
        title: "red",
        email: "#GG0000",
        website: "expression(alert(1))",
      },
    });
    assert.equal(config.colors.name, "#111827");
    assert.equal(config.colors.title, "#111827");
    assert.equal(config.colors.email, "#111827");
    assert.equal(config.colors.website, "#111827");
  });
});
