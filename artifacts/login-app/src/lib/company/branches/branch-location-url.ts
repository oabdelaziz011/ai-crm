function isGoogleMapsHost(hostname: string): { kind: "maps-host" } | { kind: "google-host" } | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "maps.app.goo.gl") return { kind: "maps-host" };
  if (host === "goo.gl") return { kind: "maps-host" };
  if (host.startsWith("maps.google.")) {
    const rest = host.slice("maps.google.".length);
    return /^[a-z]{2,3}(\.[a-z]{2})?$/.test(rest) ? { kind: "maps-host" } : null;
  }
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  if (!bare.startsWith("google.")) return null;
  const rest = bare.slice("google.".length);
  return /^[a-z]{2,3}(\.[a-z]{2})?$/.test(rest) ? { kind: "google-host" } : null;
}

/** Accepts Google Maps links only: maps.google, google.com/maps, maps.app.goo.gl, and goo.gl/maps. */
export function isGoogleMapsLocationUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = isGoogleMapsHost(url.hostname);
  if (!host) return false;
  if (url.hostname.toLowerCase() === "goo.gl") {
    const path = url.pathname.toLowerCase();
    return path === "/maps" || path.startsWith("/maps/");
  }
  if (host.kind === "maps-host") return true;
  const path = url.pathname.toLowerCase();
  return path === "/maps" || path.startsWith("/maps/");
}

export function isHttpLocationUrl(value: string): boolean {
  return isGoogleMapsLocationUrl(value);
}

export function readBranchLocationUrl(settings: Record<string, unknown> | null | undefined): string {
  const value = settings?.locationUrl;
  return typeof value === "string" ? value : "";
}

/** Keep weekly hours and other settings when the map link changes. */
export function mergeBranchLocationUrl(
  settings: Record<string, unknown> | null | undefined,
  locationUrl: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(settings && typeof settings === "object" ? settings : {}),
  };
  const trimmed = locationUrl.trim();
  if (!trimmed) {
    delete next.locationUrl;
    return next;
  }
  next.locationUrl = trimmed;
  return next;
}

export function locationUrlError(value: string): "invalidUrl" | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isHttpLocationUrl(trimmed) ? null : "invalidUrl";
}
