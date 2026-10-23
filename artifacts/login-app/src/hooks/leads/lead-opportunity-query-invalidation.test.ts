import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("Lead stage change invalidates Opportunities queries", () => {
  it("useLeadCommands invalidate includes opportunities-workspace keys", () => {
    const source = readFileSync(join(here, "use-lead-commands.ts"), "utf8");
    assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*\["opportunities-workspace"\]/);
    assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*\["opportunity360-workspace"\]/);
    assert.match(source, /changeStage[\s\S]*onSuccess:\s*\(\)\s*=>\s*invalidate\(\)/);
  });
});
