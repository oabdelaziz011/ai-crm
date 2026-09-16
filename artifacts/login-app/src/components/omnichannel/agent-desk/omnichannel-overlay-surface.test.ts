import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceCss = readFileSync(join(here, "../workspace-v2/workspace.css"), "utf8");
const quickRepliesSource = readFileSync(join(here, "composer-quick-replies-popover.tsx"), "utf8");
const composePanelSource = readFileSync(join(here, "compose-panel.tsx"), "utf8");

describe("omnichannel overlay surface opacity", () => {
  it("mirrors Omnichannel tokens for Radix portals under body", () => {
    assert.match(workspaceCss, /html:has\(\.agent-workspace\)/);
    assert.match(workspaceCss, /--ad-surface-raised:\s*hsl\(var\(--popover\)\)/);
    assert.match(workspaceCss, /\.omni-overlay-surface\s*\{/);
    assert.match(workspaceCss, /background-color:\s*hsl\(var\(--popover\)\)/);
  });

  it("Quick Replies popover uses opaque popover surface classes", () => {
    assert.match(quickRepliesSource, /omni-overlay-surface/);
    assert.match(quickRepliesSource, /bg-popover/);
    assert.doesNotMatch(
      quickRepliesSource,
      /PopoverContent[\s\S]*bg-\[var\(--ad-surface-raised\)\]/,
    );
  });

  it("composer portaled menus use opaque popover surface classes", () => {
    assert.match(composePanelSource, /omni-overlay-surface/);
    assert.match(composePanelSource, /bg-popover/);
  });
});
