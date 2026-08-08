import { useQuery } from "@tanstack/react-query";
import { useEntityWorkspaceServices } from "./use-entity-workspace-services";

export function entityTimelineQueryKey(entityType: string, entityId: string) {
  return ["entity-workspace", "timeline", entityType, entityId] as const;
}

export function useEntityTimeline(entityType: string, entityId: string) {
  const services = useEntityWorkspaceServices();

  return useQuery({
    queryKey: entityTimelineQueryKey(entityType, entityId),
    enabled: Boolean(services && entityType && entityId),
    queryFn: () => services!.timeline.list(entityType, entityId),
  });
}
