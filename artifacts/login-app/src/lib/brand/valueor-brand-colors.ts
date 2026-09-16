/**
 * ValueOR official brand colors — sourced from the login lockup PNG
 * (`public/assets/images/logo-valueor-clear.png`) and aligned with
 * `DEFAULT_BRAND_COLORS.primary`.
 *
 * The "OR" letters / mark teal in the official asset is the solid brand primary.
 * Do not invent competing teal/cyan primaries elsewhere.
 */
export const VALUEOR_OR_PRIMARY = "#0D9488" as const;

/** Accessible OR wordmark on dark chrome (sidebar / dark plates). Same brand family. */
export const VALUEOR_OR_PRIMARY_ON_DARK = "#3EE6C8" as const;

/**
 * HSL channels for CSS custom properties (space-separated, no `hsl()` wrapper).
 * Exact conversion of VALUEOR_OR_PRIMARY (#0D9488).
 */
export const VALUEOR_OR_PRIMARY_HSL = "174.7 83.9% 31.6%" as const;

/**
 * Dark-mode interactive primary — same hue family, lifted lightness for contrast
 * on dark surfaces (mirrors brand-theme-service dark primary lift ≥ 48%).
 */
export const VALUEOR_OR_PRIMARY_DARK_HSL = "174.7 70% 48%" as const;
