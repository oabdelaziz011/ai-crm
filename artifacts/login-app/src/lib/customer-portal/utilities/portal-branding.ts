import type { CSSProperties } from "react";
import type { PortalBranding } from "@/lib/customer-portal/types";

export function portalBrandingStyle(branding: PortalBranding): CSSProperties {
  return {
    ["--portal-primary" as string]: branding.primaryColor,
    ["--portal-secondary" as string]: branding.secondaryColor,
    fontFamily: branding.fontFamily,
  };
}
