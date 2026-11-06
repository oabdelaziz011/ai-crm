import { supabase } from "@/lib/supabase";
import { decodeAdminHostHandoff, encodeAdminHostHandoff } from "@/lib/platform/admin-host-handoff";

const STORAGE_KEY = "valueor.platform_admin_context";

export type StoredPlatformAdminContext = {
  id: string;
  companyId: string;
  companyName: string;
  subdomain: string;
  returnOrigin: string;
};

export function readPlatformAdminContext(): StoredPlatformAdminContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlatformAdminContext;
    if (!parsed?.id || !parsed.companyId || !parsed.subdomain) return null;
    return { ...parsed, returnOrigin: parsed.returnOrigin || window.location.origin };
  } catch {
    return null;
  }
}

export function writePlatformAdminContext(value: StoredPlatformAdminContext): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearPlatformAdminContext(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function tenantWorkspaceUrl(subdomain: string): string {
  const { protocol, hostname, port } = window.location;
  const suffix = port ? `:${port}` : "";
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1") {
    return `${protocol}//${subdomain}.localhost${suffix}/dashboard`;
  }
  return `${protocol}//${subdomain}.valueor.org/dashboard`;
}

export function platformAdminUrl(returnOrigin?: string | null): string {
  if (returnOrigin) {
    return `${returnOrigin.replace(/\/$/, "")}/dashboard/companies`;
  }
  const { protocol, hostname, port } = window.location;
  const suffix = port ? `:${port}` : "";
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1") {
    return `${protocol}//127.0.0.1${suffix}/dashboard/companies`;
  }
  return `${protocol}//app.valueor.org/dashboard/companies`;
}

export async function prepareAdminHostHandoff(context: StoredPlatformAdminContext | null): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token || !session.refresh_token) return;
  window.name = encodeAdminHostHandoff({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    context,
  });
}

export async function consumePlatformAdminHandoff(): Promise<void> {
  if (typeof window === "undefined") return;
  const handoff = decodeAdminHostHandoff(window.name);
  window.name = "";
  if (!handoff) return;
  if (handoff.context) writePlatformAdminContext(handoff.context);
  await supabase.auth.setSession({
    access_token: handoff.accessToken,
    refresh_token: handoff.refreshToken,
  });
}

export async function openPlatformCompanyContext(input: {
  companyId: string;
  companyName: string;
  subdomain: string;
}): Promise<StoredPlatformAdminContext> {
  const { data, error } = await supabase.rpc("open_platform_company_context", {
    p_company_id: input.companyId,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "forbidden");
  }
  const stored = {
    id: String(data),
    companyId: input.companyId,
    companyName: input.companyName,
    subdomain: input.subdomain,
    returnOrigin: window.location.origin,
  };
  writePlatformAdminContext(stored);
  return stored;
}

export async function closePlatformCompanyContext(contextId: string): Promise<void> {
  const { error } = await supabase.rpc("close_platform_company_context", {
    p_context_id: contextId,
  });
  clearPlatformAdminContext();
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadLivePlatformAdminContext(): Promise<StoredPlatformAdminContext | null> {
  const stored = readPlatformAdminContext();
  if (!stored) return null;
  const { data, error } = await supabase
    .from("platform_admin_contexts")
    .select("id, company_id, expires_at, revoked_at")
    .eq("id", stored.id)
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    clearPlatformAdminContext();
    return null;
  }
  if (data.company_id !== stored.companyId) {
    clearPlatformAdminContext();
    return null;
  }
  return stored;
}
