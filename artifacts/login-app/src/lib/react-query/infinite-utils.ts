/** Flatten paginated infinite-query pages into a single array. */
export function flattenInfinitePages<T>(pages: T[][] | undefined): T[] {
  if (!pages?.length) return [];
  return pages.flat();
}
