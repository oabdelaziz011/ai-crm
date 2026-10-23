/** Shared fold for catalog tokens (aliases + search). Keep in sync with ai-tool-router fold. */

export function foldCatalogText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{M}\u0640]+/gu, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/([\u0600-\u06FF])\1{2,}/gu, "$1")
    .toLocaleLowerCase();
}

export function foldCatalogToken(value: string): string {
  return foldCatalogText(value).replace(/[^\p{L}\p{N}-]+/gu, "");
}
