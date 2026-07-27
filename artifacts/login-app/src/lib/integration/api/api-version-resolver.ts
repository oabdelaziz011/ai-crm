import type { ApiVersion } from "@/lib/integration/types";

const SUPPORTED: ApiVersion[] = ["v1", "v2"];
const DEPRECATED: Partial<Record<ApiVersion, string>> = {};

export function resolveApiVersion(path: string): ApiVersion | null {
  const match = path.match(/\/api\/(v\d+)\//);
  if (!match) return null;
  const version = match[1] as ApiVersion;
  return SUPPORTED.includes(version) ? version : null;
}

export function isDeprecatedVersion(version: ApiVersion): boolean {
  return version in DEPRECATED;
}

export function getDeprecationNotice(version: ApiVersion): string | null {
  return DEPRECATED[version] ?? null;
}

export function normalizeVersionPath(version: ApiVersion, resource: string): string {
  return `/api/${version}/${resource.replace(/^\//, "")}`;
}
