import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`async ${functionName}`);
  assert.ok(start >= 0, `expected async ${functionName} in source`);
  const braceStart = source.indexOf("{", start);
  assert.ok(braceStart >= 0);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unterminated ${functionName}`);
}

describe("P0 follow-up + product-interest ownership", () => {
  it("webhook integrations do not wrap qualifyLead with schedule or product-interest side effects", () => {
    const source = readFileSync(join(here, "create-webhook-tool-router-integrations.ts"), "utf8");
    assert.doesNotMatch(source, /async qualifyLead\s*\(/);
    assert.match(source, /createSalesFollowUpAwareLeadEventPublisher|createLoginAppLeadPlatformServices/);
    assert.doesNotMatch(source, /scheduleSalesFollowUpAfterLeadQualified/);
  });

  it("webhook convertLead still cancels follow-up on conversion", () => {
    const source = readFileSync(join(here, "create-webhook-tool-router-integrations.ts"), "utf8");
    const body = extractFunctionBody(source, "convertLead");
    assert.match(body, /cancelSalesFollowUpAfterLeadStop/);
  });
});
