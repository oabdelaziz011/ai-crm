export function companyIdentityKey(companyId: string) {
  return ["company-identity", companyId] as const;
}

export function companyBrandCenterKey(companyId: string) {
  return ["company-branding", companyId] as const;
}

export function companyWorkspaceBundleKey(companyId: string) {
  return ["company-workspace", "bundle", companyId] as const;
}

export function companyBrandLogosKey(companyId: string) {
  return ["company-brand-logos", companyId] as const;
}
