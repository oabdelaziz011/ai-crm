/**
 * Lightweight allowlist sanitizer for email signature / composer HTML.
 * Strips scripts/handlers; keeps common formatting tags only.
 *
 * Composer / signature editing: no &lt;img&gt; (identity logo is appended after sanitize).
 * Message display / outbound HTML viewing: use sanitizeEmailMessageHtml (allows safe img).
 */
const COMPOSER_ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "p",
  "br",
  "span",
  "div",
  "font",
  "blockquote",
  // Email-safe signature/logo wrappers (Gmail/Outlook prefer tables over empty HR divs).
  "table",
  "tbody",
  "thead",
  "tr",
  "td",
  "th",
]);

const MESSAGE_ALLOWED_TAGS = new Set([...COMPOSER_ALLOWED_TAGS, "img"]);

const IDENTITY_MARKERS = [
  "data-valueor-email-signature",
  "data-email-identity-logo",
  "data-email-legal-footer",
  "data-valueor-outbound-main",
] as const;

function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && !/[\s<>"']/.test(trimmed) && !/^https?:\/\/javascript:/i.test(trimmed);
}

/**
 * Keep only signature-safe inline color styles (hex/rgb color + text-decoration).
 * Browsers often rewrite hex to rgb() during DOMParser; convert back to hex.
 * Rejects expression/url/javascript. Does not broaden other CSS.
 */
export function sanitizeSafeInlineColorStyle(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/expression|url\s*\(|javascript|behavior|@import/i.test(value)) return null;
  const kept: string[] = [];
  for (const part of value.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!val) continue;
    if (prop === "color") {
      const hex = sanitizeSafeFontColor(val);
      if (hex) {
        kept.push(`color:${hex}`);
        continue;
      }
    }
    if (prop === "text-decoration" && /^(none|underline)$/i.test(val)) {
      kept.push(`text-decoration:${val.toLowerCase()}`);
    }
  }
  return kept.length ? kept.join(";") : null;
}

/** Allow only hex or rgb() colors; emit canonical #RRGGBB for Gmail. */
export function sanitizeSafeFontColor(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (/^#([0-9A-Fa-f]{6})$/.test(value)) return value;
  if (/^#([0-9A-Fa-f]{3})$/.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  const rgb = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i,
  );
  if (!rgb) return null;
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (channels.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function sanitizeEmailHtmlFallback(html: string, allowImg: boolean): string {
  const allowed = allowImg ? MESSAGE_ALLOWED_TAGS : COMPOSER_ALLOWED_TAGS;
  let out = String(html ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");

  if (!allowImg) {
    out = out.replace(
      /<\/?(?:iframe|object|embed|link|meta|img|svg|math|form|input|button|textarea|select)[^>]*>/gi,
      "",
    );
  } else {
    out = out.replace(
      /<\/?(?:iframe|object|embed|link|meta|svg|math|form|input|button|textarea|select)[^>]*>/gi,
      "",
    );
  }

  out = out
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "");

  out = out.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, rawTag: string, attrs = "") => {
    const tag = String(rawTag).toLowerCase();
    if (!allowed.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "blockquote") {
      const keepAttrs: string[] = [];
      const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
      if (styleMatch && !/expression|url\s*\(/i.test(styleMatch[2])) {
        keepAttrs.push(`style="${styleMatch[2]}"`);
      }
      const classMatch = String(attrs).match(/\sclass\s*=\s*(['"])(.*?)\1/i);
      if (classMatch) keepAttrs.push(`class="${classMatch[2].replace(/"/g, "&quot;")}"`);
      return keepAttrs.length ? `<blockquote ${keepAttrs.join(" ")}>` : `<blockquote>`;
    }
    if (tag === "table" || tag === "tbody" || tag === "thead" || tag === "tr" || tag === "td" || tag === "th") {
      const keepAttrs: string[] = [];
      const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
      if (styleMatch && !/expression|url\s*\(/i.test(styleMatch[2])) {
        keepAttrs.push(`style="${styleMatch[2]}"`);
      }
      if (tag === "table") {
        for (const name of ["role", "cellpadding", "cellspacing", "border", "width"] as const) {
          const m = String(attrs).match(new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, "i"));
          if (m) keepAttrs.push(`${name}="${m[2].replace(/"/g, "&quot;")}"`);
        }
      }
      for (const marker of IDENTITY_MARKERS) {
        const m = String(attrs).match(new RegExp(`\\s${marker}\\s*=\\s*(['"])(.*?)\\1`, "i"));
        if (m) keepAttrs.push(`${marker}="${m[2]}"`);
      }
      return keepAttrs.length ? `<${tag} ${keepAttrs.join(" ")}>` : `<${tag}>`;
    }
    if (tag === "a") {
      const hrefMatch = String(attrs).match(/\shref\s*=\s*(['"])(.*?)\1/i);
      const href = hrefMatch?.[2]?.trim() ?? "";
      if (!href || /^javascript:/i.test(href)) return "<a>";
      const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
      const safeStyle = styleMatch ? sanitizeSafeInlineColorStyle(styleMatch[2]) : null;
      const styleAttr = safeStyle ? ` style="${safeStyle}"` : "";
      return `<a href="${href.replace(/"/g, "&quot;")}" rel="noopener noreferrer" target="_blank"${styleAttr}>`;
    }
    if (tag === "font") {
      const keepAttrs: string[] = [];
      const colorMatch = String(attrs).match(/\scolor\s*=\s*(['"])(.*?)\1/i);
      const safeColor = colorMatch ? sanitizeSafeFontColor(colorMatch[2]) : null;
      if (safeColor) keepAttrs.push(`color="${safeColor}"`);
      const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
      const safeStyle = styleMatch ? sanitizeSafeInlineColorStyle(styleMatch[2]) : null;
      if (safeStyle) keepAttrs.push(`style="${safeStyle}"`);
      return keepAttrs.length ? `<font ${keepAttrs.join(" ")}>` : "<font>";
    }
    if (tag === "img") {
      const srcMatch = String(attrs).match(/\ssrc\s*=\s*(['"])(.*?)\1/i);
      const src = srcMatch?.[2]?.trim() ?? "";
      if (!isSafeHttpUrl(src)) return "";
      const keep: string[] = [`src="${src.replace(/"/g, "&quot;")}"`];
      const altMatch = String(attrs).match(/\salt\s*=\s*(['"])(.*?)\1/i);
      if (altMatch) keep.push(`alt="${altMatch[2].replace(/"/g, "&quot;")}"`);
      else keep.push('alt=""');
      for (const name of ["width", "height"] as const) {
        const m = String(attrs).match(new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, "i"));
        if (m && /^\d{1,4}$/.test(m[2].trim())) keep.push(`${name}="${m[2].trim()}"`);
      }
      const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
      if (styleMatch && !/expression|url\s*\(/i.test(styleMatch[2])) {
        keep.push(`style="${styleMatch[2]}"`);
      }
      return `<img ${keep.join(" ")} />`;
    }
    const keepAttrs: string[] = [];
    const styleMatch = String(attrs).match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
    if (styleMatch) keepAttrs.push(`style="${styleMatch[2]}"`);
    for (const marker of IDENTITY_MARKERS) {
      const m = String(attrs).match(new RegExp(`\\s${marker}\\s*=\\s*(['"])(.*?)\\1`, "i"));
      if (m) keepAttrs.push(`${marker}="${m[2]}"`);
    }
    return keepAttrs.length ? `<${tag} ${keepAttrs.join(" ")}>` : `<${tag}>`;
  });
  return out;
}

function sanitizeWithOptions(html: string, allowImg: boolean): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return sanitizeEmailHtmlFallback(html, allowImg);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const allowed = new Set(
    [...(allowImg ? MESSAGE_ALLOWED_TAGS : COMPOSER_ALLOWED_TAGS)].map((tag) => tag.toUpperCase()),
  );

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
          if (name.startsWith("on") || (name === "style" && /expression|url\s*\(/i.test(attr.value))) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (el.tagName === "IMG") {
            if (name === "src") {
              if (!isSafeHttpUrl(attr.value)) el.removeAttribute(attr.name);
            } else if (name === "alt" || name === "width" || name === "height" || name === "style") {
              // keep
            } else {
              el.removeAttribute(attr.name);
            }
            continue;
          }
          if (el.tagName === "A") {
            if (name !== "href" && name !== "target" && name !== "rel" && name !== "style") {
              el.removeAttribute(attr.name);
            } else if (name === "href" && /^\s*javascript:/i.test(attr.value)) {
              el.removeAttribute(attr.name);
            } else if (name === "style") {
              const safeStyle = sanitizeSafeInlineColorStyle(attr.value);
              if (safeStyle) el.setAttribute("style", safeStyle);
              else el.removeAttribute(attr.name);
            }
          } else if (el.tagName === "SPAN" || el.tagName === "FONT" || el.tagName === "STRONG") {
            if (name !== "style" && name !== "color") {
              el.removeAttribute(attr.name);
            } else if (name === "color") {
              const safeColor = sanitizeSafeFontColor(attr.value);
              if (safeColor) el.setAttribute("color", safeColor);
              else el.removeAttribute(attr.name);
            } else if (name === "style") {
              const safeStyle = sanitizeSafeInlineColorStyle(attr.value);
              if (safeStyle) el.setAttribute("style", safeStyle);
              else el.removeAttribute(attr.name);
            }
          } else if (el.tagName === "BLOCKQUOTE") {
            if (name !== "style" && name !== "class") el.removeAttribute(attr.name);
          } else if (
            el.tagName === "TABLE" ||
            el.tagName === "TBODY" ||
            el.tagName === "THEAD" ||
            el.tagName === "TR" ||
            el.tagName === "TD" ||
            el.tagName === "TH"
          ) {
            const allowedTableAttrs = new Set([
              "style",
              "role",
              "cellpadding",
              "cellspacing",
              "border",
              "width",
              "align",
              "valign",
              "data-valueor-email-signature",
              "data-email-identity-logo",
              "data-email-legal-footer",
              "data-valueor-outbound-main",
            ]);
            if (!allowedTableAttrs.has(name)) el.removeAttribute(attr.name);
          } else if (
            name === "style" ||
            name === "data-valueor-email-signature" ||
            name === "data-email-identity-logo" ||
            name === "data-email-legal-footer" ||
            name === "data-valueor-outbound-main"
          ) {
            // keep
          } else {
            el.removeAttribute(attr.name);
          }
        }
        if (el.tagName === "IMG") {
          const src = el.getAttribute("src") ?? "";
          if (!isSafeHttpUrl(src)) {
            el.remove();
            continue;
          }
          if (!el.hasAttribute("alt")) el.setAttribute("alt", "");
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

/** Composer / signature editor — never keeps img (logo appended after sanitize). */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeWithOptions(html, false);
}

/**
 * Persisted / displayed email HTML — allows a single safe http(s) identity logo img
 * while still blocking scripts and unsafe tags.
 */
export function sanitizeEmailMessageHtml(html: string): string {
  return sanitizeWithOptions(html, true);
}
