import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { resolveDocumentTitle } from "@/lib/document-title";

/**
 * Keeps `document.title` in sync with the active wouter route and UI language.
 * Mount once under the app router — do not set titles per page.
 */
export function DocumentTitleManager() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation("common");

  useEffect(() => {
    document.title = resolveDocumentTitle(location, t);
  }, [location, t, i18n.language]);

  return null;
}
