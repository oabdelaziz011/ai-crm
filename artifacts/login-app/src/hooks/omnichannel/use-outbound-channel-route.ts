import { useQuery } from "@tanstack/react-query";
import {
  validateOutboundRoute,
  type OutboundRouteTarget,
} from "@/lib/omnichannel/services/outbound-delivery";
import { resolveChannelSession } from "@/lib/omnichannel/services/channel-session-resolver";

export function useOutboundChannelRoute(target: OutboundRouteTarget | null) {
  return useQuery({
    queryKey: ["outbound-channel-route", target?.conversationId ?? null],
    enabled: Boolean(target?.conversationId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!target) return { connected: false as const, issue: null };
      const session = await resolveChannelSession(target.conversationId);
      const validation = validateOutboundRoute(session, target);
      if (!validation.ok) {
        return { connected: false as const, issue: validation.issue, session };
      }
      return { connected: true as const, issue: null, session, route: validation.route };
    },
  });
}
