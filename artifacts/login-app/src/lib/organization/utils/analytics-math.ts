export function rankBy<T>(items: T[], scoreFn: (item: T) => number): Array<T & { ranking: number }> {
  const sorted = [...items].sort((a, b) => scoreFn(b) - scoreFn(a));
  return sorted.map((item, index) => ({ ...item, ranking: index + 1 }));
}

export function percentRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
