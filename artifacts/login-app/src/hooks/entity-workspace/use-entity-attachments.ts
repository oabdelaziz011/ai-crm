import { useQuery } from "@tanstack/react-query";
import { useEntityWorkspaceServices } from "./use-entity-workspace-services";

export function entityAttachmentsQueryKey(entityType: string, entityId: string) {
  return ["entity-workspace", "attachments", entityType, entityId] as const;
}

export function useEntityAttachments(entityType: string, entityId: string) {
  const services = useEntityWorkspaceServices();

  return useQuery({
    queryKey: entityAttachmentsQueryKey(entityType, entityId),
    enabled: Boolean(services && entityType && entityId),
    queryFn: () => services!.attachments.list(entityType, entityId),
  });
}
