import type { ComponentType } from "react";
import { PUBLIC_LEGAL_PATHS } from "@/lib/legal/public-legal-paths";
import DataDeletionPage from "@/pages/legal/data-deletion-page";
import PrivacyPolicyPage from "@/pages/legal/privacy-policy-page";
import TermsPage from "@/pages/legal/terms-page";

export type PublicLegalRouteDefinition = {
  path: (typeof PUBLIC_LEGAL_PATHS)[number];
  Page: ComponentType;
};

export const PUBLIC_LEGAL_ROUTES: readonly PublicLegalRouteDefinition[] = [
  { path: "/privacy-policy", Page: PrivacyPolicyPage },
  { path: "/data-deletion", Page: DataDeletionPage },
  { path: "/terms", Page: TermsPage },
];
