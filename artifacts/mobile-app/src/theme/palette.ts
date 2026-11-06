export type Palette = {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
};

export const lightPalette: Palette = {
  background: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  primary: "#0D9488",
  primaryText: "#FFFFFF",
  danger: "#DC2626",
  success: "#16A34A",
  warning: "#D97706",
};

export const brand = {
  canvas: "#041C1B",
  canvasMid: "#0A3D3A",
  primary: "#0D9488",
  primaryPressed: "#0F766E",
  plate: "#F4F6F8",
  card: "#FFFFFF",
} as const;

export const darkPalette: Palette = {
  background: "#0F172A",
  card: "#1E293B",
  text: "#F8FAFC",
  muted: "#94A3B8",
  border: "#334155",
  primary: "#14B8A6",
  primaryText: "#042F2E",
  danger: "#F87171",
  success: "#4ADE80",
  warning: "#FBBF24",
};
