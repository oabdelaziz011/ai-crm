const HANDOFF_MARK = "valueor-admin-handoff-v1\n";

export type AdminHostHandoff = {
  accessToken: string;
  refreshToken: string;
  context: {
    id: string;
    companyId: string;
    companyName: string;
    subdomain: string;
    returnOrigin: string;
  } | null;
};

export function encodeAdminHostHandoff(value: AdminHostHandoff): string {
  return HANDOFF_MARK + JSON.stringify(value);
}

export function decodeAdminHostHandoff(value: string | null | undefined): AdminHostHandoff | null {
  if (!value?.startsWith(HANDOFF_MARK)) return null;
  try {
    const parsed = JSON.parse(value.slice(HANDOFF_MARK.length)) as AdminHostHandoff;
    if (!parsed?.accessToken || !parsed.refreshToken) return null;
    if (parsed.context && (!parsed.context.id || !parsed.context.companyId || !parsed.context.subdomain)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
