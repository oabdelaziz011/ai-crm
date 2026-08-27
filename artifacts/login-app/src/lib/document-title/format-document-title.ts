import { APP_BRAND_NAME, DOCUMENT_TITLE_SEPARATOR } from "./constants";

/** Build `[Page Name] | ValueOR`, or just the brand when page name is empty. */
export function formatDocumentTitle(
  pageName: string,
  brand: string = APP_BRAND_NAME,
): string {
  const trimmed = pageName.trim();
  if (!trimmed || trimmed === brand) {
    return brand;
  }
  return `${trimmed}${DOCUMENT_TITLE_SEPARATOR}${brand}`;
}
