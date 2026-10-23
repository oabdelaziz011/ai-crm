import type { WebsiteContent, WebsiteGallery, WebsiteSections } from "@/lib/website/website-model";

export type WebsiteEditorSlice = {
  headline: string;
  description: string;
  sections: WebsiteSections;
  gallery: WebsiteGallery;
  content: WebsiteContent;
};

export type WebsiteEditorHistory = {
  past: WebsiteEditorSlice[];
  future: WebsiteEditorSlice[];
};

export function emptyEditorHistory(): WebsiteEditorHistory {
  return { past: [], future: [] };
}

export function commitEditorChange(history: WebsiteEditorHistory, previous: WebsiteEditorSlice, limit = 40): WebsiteEditorHistory {
  const past = [...history.past, previous];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undoEditorChange(
  history: WebsiteEditorHistory,
  current: WebsiteEditorSlice,
): { history: WebsiteEditorHistory; value: WebsiteEditorSlice } | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    value: previous,
  };
}

export function redoEditorChange(
  history: WebsiteEditorHistory,
  current: WebsiteEditorSlice,
): { history: WebsiteEditorHistory; value: WebsiteEditorSlice } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    value: next,
  };
}

export const WEBSITE_HEADER_TEMPLATES = ["classic", "center", "modern", "minimal", "split", "transparent", "overlay"] as const;

export const WEBSITE_PALETTE_BLOCKS = [
  "hero-title",
  "hero-text",
  "hero-image",
  "gallery",
  "services",
  "features",
  "testimonials",
  "hours",
  "location",
  "contact",
  "booking",
  "video",
  "products",
  "social",
  "chat",
] as const;

export const WEBSITE_UNSUPPORTED_BLOCKS = ["faq", "divider"] as const;
