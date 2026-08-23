import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createCrmAgentToolPorts } from "./crm-agent-adapter";
import { createLoginAppCrmRagKnowledgeRetriever } from "./create-login-app-crm-rag-knowledge-retriever";

export function useCrmAgentToolPorts() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const companyId = profile?.company_id ?? null;

  const portContext = useMemo(() => {
    if (!companyId || !user?.id) return null;
    return {
      companyId,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    };
  }, [companyId, user?.id, isSuperAdmin, hasPermission]);

  const retrieveKnowledge = useMemo(
    () => createLoginAppCrmRagKnowledgeRetriever(supabase),
    [],
  );

  return useMemo(() => {
    if (!portContext) return undefined;
    return createCrmAgentToolPorts({ portContext, retrieveKnowledge });
  }, [portContext, retrieveKnowledge]);
}
