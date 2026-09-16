import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "instagram-webhook-post.ts"), "utf8");

function extractCallBodies(fnName: string): string[] {
  const bodies: string[] = [];
  const needle = `${fnName}(`;
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) break;
    const open = source.indexOf("{", start);
    if (open < 0) break;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      if (source[end] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(open, end + 1));
          from = end + 1;
          break;
        }
      }
    }
    if (end >= source.length) break;
  }
  return bodies;
}

describe("Instagram webhook POST signature diagnostics", () => {
  it("verifies HMAC against collected Instagram secrets and still rejects invalid signatures with 401", () => {
    assert.match(source, /collectInstagramWebhookSignatureSecrets\(/);
    assert.match(source, /verifyMetaWebhookSignatureWithSecrets\(/);
    assert.match(
      source,
      /verifyMetaWebhookSignatureWithSecrets\(\{[\s\S]*secrets:\s*secretSet\.candidates[\s\S]*requireSecret,[\s\S]*\}\)/,
    );
    assert.match(source, /res\.status\(401\)\.json\(\{\s*error:\s*"invalid_signature"\s*\}\)/);
    assert.doesNotMatch(source, /signatureValid\s*=\s*true/);
    const requireSecretAssign = source.match(/const requireSecret = ([^;]+);/);
    assert.equal(
      requireSecretAssign?.[1]?.trim(),
      "env.webhookRequireSignature && env.nodeEnv === \"production\"",
    );
  });

  it("uses a single UTF-8 conversion of the Express Buffer and does not HMAC reserialized JSON", () => {
    assert.match(
      source,
      /req\.body instanceof Buffer\s*\n?\s*\? req\.body\.toString\("utf8"\)/,
    );
    const hmacCall = source.slice(source.indexOf("verifyMetaWebhookSignatureWithSecrets"));
    assert.match(hmacCall, /rawBody,/);
    assert.doesNotMatch(
      source.slice(0, source.indexOf("verifyMetaWebhookSignatureWithSecrets")),
      /JSON\.stringify\(payload/,
    );
  });

  it("logs safe boolean signature diagnostics around verification", () => {
    const infoBodies = extractCallBodies("logger.info").join("\n");
    assert.match(source, /instagramWebhookDiag:\s*true/);
    assert.match(infoBodies, /diagStage:\s*"post\.signature_verification\.start"/);
    assert.match(infoBodies, /diagStage:\s*"post\.signature_verification\.result"/);
    assert.match(infoBodies, /diagStage:\s*"post\.early_return"/);
    assert.match(source, /companyCredentialSource:\s*"company_instagram_settings"/);
    assert.match(source, /expectedMetaAppId:\s*secretSet\.expectedMetaAppId/);
    assert.match(source, /envAppIdIsDiagnosticOnly:\s*true/);
    assert.match(source, /secretSources:/);
    assert.match(source, /secretCandidateLengths:/);
    assert.match(source, /usesRawUtf8Body:\s*true/);
    assert.match(source, /signatureHeaderPresent/);
    assert.match(source, /signatureHeaderStartsWithSha256/);
    assert.match(source, /signatureHeaderLength/);
    assert.match(source, /rawBodyIsBuffer/);
    assert.match(source, /rawBodyByteLength/);
    assert.match(source, /hasSignatureHeader = Boolean\(signatureHeader\)/);
    assert.match(source, /hasAppSecret = secretSet\.candidates\.length > 0/);
    assert.match(source, /requireSecret,/);
    assert.match(infoBodies, /signatureValid,/);
    assert.match(infoBodies, /matchedSecretSource:/);
    assert.match(source, /requestId,/);
    assert.match(source, /companyId:\s*channel\.companyId/);
    assert.match(source, /instagramBusinessAccountId,/);
    assert.match(source, /\[IG-WEBHOOK-DIAG\] post\.signature_verification\.start/);
    assert.match(source, /\[IG-WEBHOOK-DIAG\] post\.signature_verification\.result/);
    assert.match(source, /describeInstagramWebhookShape\(payload\)/);
  });

  it("does not log secrets, HMAC material, or the raw body", () => {
    const logged = [
      ...extractCallBodies("logger.info"),
      ...extractCallBodies("logger.error"),
      ...extractCallBodies("trace.step"),
    ].join("\n");

    assert.doesNotMatch(logged, /previewRawBody/);
    assert.doesNotMatch(logged, /rawBody,/);
    assert.doesNotMatch(logged, /rawBody:/);
    assert.doesNotMatch(logged, /trimmedSignatureHeader/);
    assert.doesNotMatch(logged, /signatureHeaderPrefix/);
    assert.doesNotMatch(logged, /appSecretForSignature/);
    assert.doesNotMatch(logged, /accessToken/);
    assert.doesNotMatch(logged, /verifyToken/);
    assert.doesNotMatch(logged, /authorization/i);
    assert.doesNotMatch(logged, /hmac/i);
    assert.doesNotMatch(logged, /x-hub-signature-256/);
  });
});
