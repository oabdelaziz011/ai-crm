/** Shared focus ids for Brand Health deep-links into Brand Center sections. */
export const BRAND_FOCUS = {
  logoMain: "logo-main",
  logoDark: "logo-dark",
  logoLight: "logo-light",
  logoSquare: "logo-square",
  logoInvoice: "logo-invoice",
  logoEmail: "logo-email",
  colorPrimary: "color-primary",
  colorSecondary: "color-secondary",
  colorSidebar: "color-sidebar",
  colorSidebarActive: "color-sidebarActive",
  emailSender: "email-sender",
  emailFooter: "email-footer",
} as const;

export function brandFocusSelector(focusId: string): string {
  return `[data-brand-focus="${focusId}"]`;
}
