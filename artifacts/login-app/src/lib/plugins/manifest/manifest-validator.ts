import type { PluginManifest, ManifestValidationResult } from "@/lib/plugins/types";
import { CURRENT_PLATFORM_VERSION } from "@/lib/plugins/types/plugin-enums";

const REQUIRED_FIELDS = ["pluginId", "name", "author", "version", "category", "permissions", "entryPoints"] as const;

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9.-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

export function validateManifest(input: Partial<PluginManifest>): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (input.pluginId && !PLUGIN_ID_PATTERN.test(input.pluginId)) {
    errors.push("pluginId must be lowercase alphanumeric with dots/hyphens");
  }

  if (input.version && !SEMVER_PATTERN.test(input.version)) {
    errors.push("version must be semver (e.g. 1.0.0)");
  }

  if (input.minPlatformVersion && !SEMVER_PATTERN.test(input.minPlatformVersion)) {
    errors.push("minPlatformVersion must be semver");
  }

  if (input.minPlatformVersion && compareSemver(input.minPlatformVersion, CURRENT_PLATFORM_VERSION) > 0) {
    errors.push(`Plugin requires platform ${input.minPlatformVersion}, current is ${CURRENT_PLATFORM_VERSION}`);
  }

  if (input.maxPlatformVersion && input.minPlatformVersion) {
    if (compareSemver(input.maxPlatformVersion, input.minPlatformVersion) < 0) {
      errors.push("maxPlatformVersion must be >= minPlatformVersion");
    }
  }

  if (!input.entryPoints?.main && !input.entryPoints?.["main"]) {
    if (input.entryPoints && Object.keys(input.entryPoints).length === 0) {
      errors.push("At least one entry point required");
    }
  }

  if (!input.permissions || input.permissions.length === 0) {
    warnings.push("Plugin declares no permissions — limited functionality");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function parseManifest(raw: Record<string, unknown>): PluginManifest {
  return {
    pluginId: String(raw.pluginId ?? ""),
    name: String(raw.name ?? ""),
    author: String(raw.author ?? ""),
    version: String(raw.version ?? "1.0.0"),
    description: raw.description ? String(raw.description) : undefined,
    category: (raw.category as PluginManifest["category"]) ?? "general",
    permissions: (raw.permissions as PluginManifest["permissions"]) ?? [],
    minPlatformVersion: String(raw.minPlatformVersion ?? "7.0.0"),
    maxPlatformVersion: raw.maxPlatformVersion ? String(raw.maxPlatformVersion) : undefined,
    dependencies: (raw.dependencies as string[]) ?? [],
    entryPoints: (raw.entryPoints as Record<string, string>) ?? { main: "index.js" },
    hooks: (raw.hooks as PluginManifest["hooks"]) ?? [],
    widgets: raw.widgets as string[] | undefined,
    commands: raw.commands as string[] | undefined,
    settings: raw.settings as Record<string, unknown> | undefined,
    events: raw.events as PluginManifest["events"],
    extensionPoints: raw.extensionPoints as PluginManifest["extensionPoints"],
    signatureHash: raw.signatureHash ? String(raw.signatureHash) : undefined,
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
