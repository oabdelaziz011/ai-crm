/**
 * Stable deterministic accent color from a user/profile id.
 * Never random — same id always yields the same HSL.
 */
export function avatarColorFromId(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  // Teal-biased ValueOR palette (avoid neon / purple cluster)
  const sat = 42 + (Math.abs(hash >> 8) % 18);
  const light = 38 + (Math.abs(hash >> 16) % 12);
  return `hsl(${hue} ${sat}% ${light}%)`;
}
