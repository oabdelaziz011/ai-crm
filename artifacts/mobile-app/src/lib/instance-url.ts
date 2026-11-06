const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type InstanceTarget = {
  hostname: string;
  origin: string;
};

export function readInstanceTarget(value: string | null | undefined): InstanceTarget | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 253 || /\s/.test(raw)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const local = LOCAL_HTTP_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  if (url.protocol === "http:" && !local) return null;
  if (!hostname) return null;

  const port = url.port ? `:${url.port}` : "";
  return { hostname, origin: `${url.protocol}//${hostname}${port}` };
}

export function searchPattern(value: string): string | null {
  const trimmed = value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return trimmed ? `%${trimmed}%` : null;
}
