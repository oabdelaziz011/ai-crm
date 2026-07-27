import type { PluginManifest } from "@/lib/plugins/types";
import { validateManifest } from "@/lib/plugins/manifest/manifest-validator";

/** Plugin SDK — CLI and dev utilities foundation. */
export type PluginCliCommand = "init" | "validate" | "dev" | "build" | "test";

export function createPluginScaffold(input: { pluginId: string; name: string; category: PluginManifest["category"] }): PluginManifest {
  return {
    pluginId: input.pluginId,
    name: input.name,
    author: "Developer",
    version: "0.1.0",
    category: input.category,
    permissions: ["reports.read"],
    minPlatformVersion: "7.4.0",
    dependencies: [],
    entryPoints: { main: "src/index.ts" },
    hooks: ["widget"],
    events: ["booking.created"],
    extensionPoints: ["dashboard.widget"],
  };
}

export function validatePluginManifest(manifest: Partial<PluginManifest>) {
  return validateManifest(manifest);
}

export function generatePluginEntryStub(manifest: PluginManifest): string {
  return `/** ${manifest.name} v${manifest.version} */
export default {
  pluginId: "${manifest.pluginId}",
  onLoad(ctx) { return { ready: true, companyId: ctx.companyId }; },
  onEvent(event, ctx) { console.log("[${manifest.pluginId}]", event.type); },
  widgets: [{ id: "main", title: "${manifest.name}", render: () => null }],
};
`;
}
