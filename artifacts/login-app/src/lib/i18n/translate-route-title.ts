/** Resolve a route-registry titleKey — never fall back to raw English segment ids. */
export function translateRouteTitle(
  t: (key: string) => string,
  titleKey: string,
): string {
  return t(titleKey);
}
