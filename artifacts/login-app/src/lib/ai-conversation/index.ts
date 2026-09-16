import type { ServiceContext } from "@workspace/ai-conversation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createConversationServicesWithSla } from "@/lib/ai-conversation/create-conversation-services-with-sla";

type VisibilityMeta = {
  departmentId: string | null;
  managedDepartmentIds: string[];
};

const EMPTY_VISIBILITY: VisibilityMeta = {
  departmentId: null,
  managedDepartmentIds: [],
};

/**
 * Factory hook for Conversation domain services.
 * Business logic lives in @workspace/ai-conversation — not in UI.
 * Priority updates recalculate lifecycle.slaDueAt via Ticket SLA calculator.
 *
 * Phase 6D Step 2: loads actor department_id + managed department IDs so
 * View Assigned service-layer visibility matches RLS.
 */
export function useConversationServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const [visibilityMeta, setVisibilityMeta] = useState<VisibilityMeta>(EMPTY_VISIBILITY);

  const services = useMemo(() => createConversationServicesWithSla(supabase), []);

  useEffect(() => {
    const userId = user?.id ?? null;
    const companyId = profile?.company_id ?? null;
    if (!userId || !companyId) {
      setVisibilityMeta(EMPTY_VISIBILITY);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [profileResult, managedResult] = await Promise.all([
        supabase.from("profiles").select("department_id").eq("id", userId).maybeSingle(),
        supabase.rpc("list_managed_department_ids", { p_company_id: companyId }),
      ]);

      if (cancelled) return;

      const departmentId =
        typeof profileResult.data?.department_id === "string" && profileResult.data.department_id.trim()
          ? profileResult.data.department_id.trim()
          : null;

      const managedRaw = managedResult.data;
      const managedDepartmentIds = Array.isArray(managedRaw)
        ? managedRaw
            .map((id) => (typeof id === "string" ? id.trim() : String(id ?? "").trim()))
            .filter((id) => id.length > 0)
        : [];

      setVisibilityMeta({ departmentId, managedDepartmentIds });
    })().catch(() => {
      if (!cancelled) setVisibilityMeta(EMPTY_VISIBILITY);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.company_id]);

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
      departmentId: visibilityMeta.departmentId,
      managedDepartmentIds: visibilityMeta.managedDepartmentIds,
    }),
    [
      user?.id,
      profile?.company_id,
      isSuperAdmin,
      hasPermission,
      visibilityMeta.departmentId,
      visibilityMeta.managedDepartmentIds,
    ],
  );

  return { services, context };
}
