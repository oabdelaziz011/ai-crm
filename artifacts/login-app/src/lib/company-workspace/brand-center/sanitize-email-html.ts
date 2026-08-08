/**
 * Lightweight allowlist sanitizer for email signature HTML produced by the RTE.
 * Strips scripts/handlers; keeps common formatting tags only.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "A",
    "UL",
    "OL",
    "LI",
    "P",
    "BR",
    "SPAN",
    "DIV",
    "FONT",
  ]);

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!allowed.has(el.tagName)) {
          while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
          el.remove();
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on") || name === "style" && /expression|url\s*\(/i.test(attr.value)) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (el.tagName === "A") {
            if (name !== "href" && name !== "target" && name !== "rel") {
              el.removeAttribute(attr.name);
            } else if (name === "href" && /^\s*javascript:/i.test(attr.value)) {
              el.removeAttribute(attr.name);
            }
          } else if (el.tagName === "SPAN" || el.tagName === "FONT") {
            if (name !== "style" && name !== "color") el.removeAttribute(attr.name);
          } else if (name !== "style") {
            el.removeAttribute(attr.name);
          }
        }
        if (el.tagName === "A") {
          el.setAttribute("rel", "noopener noreferrer");
          el.setAttribute("target", "_blank");
        }
        walk(el);
      }
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
}
