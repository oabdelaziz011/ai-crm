const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[),.،؛!؟]+$/;

export type TextLinkPart = {
  text: string;
  href: string | null;
};

function trimUrl(raw: string): { url: string; trailing: string } {
  const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
  return { url: trailing ? raw.slice(0, -trailing.length) : raw, trailing };
}

export function splitTextLinks(text: string): TextLinkPart[] {
  const parts: TextLinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), href: null });
    const { url, trailing } = trimUrl(match[0]);
    if (url) parts.push({ text: url, href: url });
    if (trailing) parts.push({ text: trailing, href: null });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });
  return parts.length > 0 ? parts : [{ text, href: null }];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text with http(s) addresses marked as links. Newlines stay as text. */
export function renderLinkedTextHtml(text: string): string {
  return splitTextLinks(text)
    .map((part) => {
      if (!part.href) return escapeHtml(part.text);
      const safe = escapeHtml(part.href);
      return `<a href="${safe}" dir="ltr" class="text-blue-600 underline" style="color:#2563eb;unicode-bidi:isolate">${safe}</a>`;
    })
    .join("");
}
