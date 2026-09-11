import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { resolveDocumentDescription, resolveDocumentTitle } from "@/lib/document-title";

function upsertMetaByName(name: string, content: string) {
  if (typeof document === "undefined") return;
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  if (typeof document === "undefined") return;
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

/**
 * Keeps `document.title` and public meta description in sync with the active
 * wouter route and UI language. Mount once under the app router.
 */
export function DocumentTitleManager() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");

  useEffect(() => {
    const title = resolveDocumentTitle(location, t);
    const description = resolveDocumentDescription(location, t);
    document.title = title;
    upsertMetaByName("description", description);
    upsertMetaByProperty("og:title", title);
    upsertMetaByProperty("og:description", description);
    upsertMetaByName("twitter:title", title);
    upsertMetaByName("twitter:description", description);
  }, [location, t, i18n.language]);

  return null;
}
