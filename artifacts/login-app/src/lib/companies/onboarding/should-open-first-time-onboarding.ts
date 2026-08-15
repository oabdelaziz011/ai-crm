/**
 * First-time Company Onboarding should open only when the authenticated user
 * has no company membership and is not a platform super-admin.
 *
 * Wait until auth + identity (profile/company) are settled so a normal login
 * does not flash the onboarding wizard while company_id is still loading.
 */
export function shouldOpenFirstTimeCompanyOnboarding(input: {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  companyId: string | null | undefined;
  isSuperAdmin: boolean;
  /** True while profile/company membership is still resolving after sign-in. */
  isIdentityPending?: boolean;
}): boolean {
  if (input.isAuthLoading) return false;
  if (input.isIdentityPending) return false;
  if (!input.isAuthenticated) return false;
  if (input.isSuperAdmin) return false;
  return !input.companyId;
}
