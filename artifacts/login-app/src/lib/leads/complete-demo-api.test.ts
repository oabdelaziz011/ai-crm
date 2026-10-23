import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("completeSalesDemoRequest client", () => {
  it("posts to the authoritative complete-demo endpoint without client-side stage writes", () => {
    const source = readFileSync(join(here, "complete-demo-api.ts"), "utf8");
    assert.match(source, /\/leads\/\$\{encodeURIComponent\(leadId\)\}\/complete-demo/);
    assert.match(source, /method:\s*"POST"/);
    assert.equal(/changeStage|lifecycleStatus\s*=/.test(source), false);
  });

  it("leads table wires Complete Demo through the API client", () => {
    const page = readFileSync(
      join(here, "../../pages/dashboard/leads/leads-table-page.tsx"),
      "utf8",
    );
    assert.match(page, /completeSalesDemoRequest/);
    assert.match(page, /completeDemo:\s*completeDemoMutation/);
    assert.equal(/demo_completed[\s\S]*changeStage\.mutateAsync/.test(page), false);
  });
});
