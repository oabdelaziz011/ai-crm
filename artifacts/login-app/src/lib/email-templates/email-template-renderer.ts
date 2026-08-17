import type { EmailTemplateRenderContext } from "./types";

const TOKEN_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export type EmailTemplateRenderResult = {
  subject: string;
  body: string;
  unresolved: string[];
};

function renderText(content: string, context: EmailTemplateRenderContext): {
  text: string;
  unresolved: string[];
} {
  const unresolved = new Set<string>();
  const text = content.replace(TOKEN_RE, (_match, rawKey: string) => {
    const key = String(rawKey).trim().toLowerCase();
    const value = context[key as keyof EmailTemplateRenderContext];
    if (typeof value === "string") return value;
    unresolved.add(key);
    // Leave unknown / missing placeholders intact (safe, no code execution).
    return `{{${key}}}`;
  });
  return { text, unresolved: [...unresolved] };
}

/** Safe mustache-style replacement only. No JS / HTML evaluation. */
export function renderEmailTemplate(
  input: { subject: string; body: string },
  context: EmailTemplateRenderContext,
): EmailTemplateRenderResult {
  const subject = renderText(input.subject ?? "", context);
  const body = renderText(input.body ?? "", context);
  const unresolved = [...new Set([...subject.unresolved, ...body.unresolved])].sort();
  return {
    subject: subject.text,
    body: body.text,
    unresolved,
  };
}
