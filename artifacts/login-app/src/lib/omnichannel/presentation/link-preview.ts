const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export type LinkPreviewData = {
  url: string;
  hostname: string;
  title: string;
};

export function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((match) => match[0]!);
}

export function buildLinkPreview(url: string): LinkPreviewData {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return {
      url,
      hostname,
      title: `${hostname}${path}`.slice(0, 120),
    };
  } catch {
    return { url, hostname: url, title: url };
  }
}

export function firstLinkPreview(text: string): LinkPreviewData | null {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;
  return buildLinkPreview(urls[0]!);
}
