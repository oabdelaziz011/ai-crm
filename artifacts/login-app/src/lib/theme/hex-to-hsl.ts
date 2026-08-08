export type HslChannels = {
  h: number;
  s: number;
  l: number;
};

/** Parse #RGB / #RRGGBB / #RRGGBBAA into HSL channels. */
export function hexToHsl(hex: string): HslChannels | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
    return null;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  if (raw.length === 3) {
    r = parseInt(raw[0]! + raw[0]!, 16);
    g = parseInt(raw[1]! + raw[1]!, 16);
    b = parseInt(raw[2]! + raw[2]!, 16);
  } else {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** shadcn channel format: `H S% L%` (no `hsl()` wrapper). */
export function hslToCssChannels(hsl: HslChannels): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

export function withLightness(hsl: HslChannels, l: number): HslChannels {
  return { ...hsl, l: clamp(l, 0, 100) };
}

export function withSaturation(hsl: HslChannels, s: number): HslChannels {
  return { ...hsl, s: clamp(s, 0, 100) };
}

/** Readable foreground channels for a given background lightness. */
export function contrastForeground(hsl: HslChannels): string {
  return hsl.l > 55 ? "222 47% 11%" : "0 0% 100%";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
