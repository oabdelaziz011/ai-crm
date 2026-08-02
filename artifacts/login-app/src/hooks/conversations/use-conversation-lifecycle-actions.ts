import { useCallback, useMemo } from "react";

import type { InfiniteData } from "@tanstack/react-query";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ConversationRecord } from "@workspace/ai-conversation";

import { useConversationServices } from "@/lib/ai-conversation";

import { useConversationActions } from "@/hooks/conversations/use-conversation-actions";

import { useOmnichannelAccess } from "@/hooks/omnichannel/use-conversation-realtime";

import {

  appendTimelineEvent,

  conversationLifecycleCoordinator,

  inferLifecycleRole,

  canLinkCustomer,

  canCreateCustomer,

  type LifecycleAction,

  type LifecyclePermissionContext,

} from "@/lib/conversation-lifecycle";

import type { TransitionPayload } from "@/lib/conversation-lifecycle/integration/lifecycle-transition-executor";

import { getLifecycleSnapshot } from "@/lib/conversation-lifecycle/integration/lifecycle-query-utils";

import {

  executeBackendLifecycleHint,

  linkCustomerViaBackend,

  persistLifecycleMetadata,

} from "@/lib/conversation-lifecycle/adapters/backend-action-executor";

import { conversationMessagesQueryKey } from "@/hooks/conversations/use-conversation-messages";

import { invalidateOmnichannelQueries } from "@/lib/omnichannel/cache/invalidate-omnichannel-queries";

import { omnichannelCustomerContextKey } from "@/lib/omnichannel/cache/query-keys";

import type { EscalationLevel } from "@/lib/conversation-lifecycle/types/lifecycle-types";



export type EscalationSubmitPayload = {

  escalateTo: EscalationLevel;

  reason: string;

  priority: string;

  notes: string;

};



export function useConversationLifecycleActions(companyId: string | null) {

  const queryClient = useQueryClient();

  const access = useOmnichannelAccess();

  const { services, context } = useConversationServices();

  const { assign, release, close } = useConversationActions(companyId);



  const permissionContext = useMemo((): LifecyclePermissionContext | undefined => {

    if (!access) return undefined;

    return {

      role: inferLifecycleRole({

        isSuperAdmin: access.isSuperAdmin,

        hasPermission: access.hasPermission,

        isAiParticipant: false,

      }),

      userId: access.userId,

      isSuperAdmin: access.isSuperAdmin,

      hasPermission: access.hasPermission,

    };

  }, [access]);



  const patchConversationListCache = useCallback(
    (
      conversationId: string,
      patch: Partial<ConversationRecord> & { metadata?: Record<string, unknown> },
    ) => {
      queryClient.setQueriesData<InfiniteData<{ rows: ConversationRecord[]; nextOffset: number | null }>>(
        { queryKey: ["conversation-list", companyId] },
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              rows: page.rows.map((row) =>
                row.id === conversationId
                  ? {
                      ...row,
                      ...patch,
                      metadata: patch.metadata ?? row.metadata,
                    }
                  : row,
              ),
            })),
          };
        },
      );
    },
    [companyId, queryClient],
  );

  const invalidate = useCallback(
    async (conversationId?: string, customerId?: string | null) => {
      if (companyId) {
        invalidateOmnichannelQueries(queryClient, { companyId, conversationId });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
      }
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: conversationMessagesQueryKey(conversationId),
        });
      }
      if (customerId) {
        await queryClient.invalidateQueries({
          queryKey: omnichannelCustomerContextKey(customerId),
        });
      }
    },
    [queryClient, companyId],
  );



  const transitionMutation = useMutation({

    mutationFn: async (input: {

      record: ConversationRecord;

      action: LifecycleAction;

      payload?: TransitionPayload;

    }) => {

      const coordinatorInput = {

        record: input.record,

        permissionContext,

      };



      if (!conversationLifecycleCoordinator.canPerform(coordinatorInput, input.action)) {

        throw new Error(`Action "${input.action}" is not permitted`);

      }



      const result = conversationLifecycleCoordinator.transition(

        coordinatorInput,

        input.action,

        input.payload,

      );



      if (!result.success || !result.metadata) {

        throw new Error(result.reason ?? "Transition failed");

      }



      await persistLifecycleMetadata(services, context, input.record.id, result.metadata);



      await executeBackendLifecycleHint(services, context, {

        conversationId: input.record.id,

        action: input.action,

        hint: result.backendHint ?? null,

        assignedUserId: result.assignedUserId,

        metadata: result.metadata,

      });



      return result;

    },

    onSuccess: (result, variables) => {
      patchConversationListCache(variables.record.id, {
        assigned_user_id: result.assignedUserId ?? variables.record.assigned_user_id,
        metadata: result.metadata,
      });
      void invalidate(variables.record.id, variables.record.customer_id);
    },

  });



  const linkCustomer = useMutation({

    mutationFn: async (input: {

      record: ConversationRecord;

      customerId: string;

      customerName: string;

    }) => {

      if (!companyId) throw new Error("Company required");

      if (permissionContext && !canLinkCustomer(permissionContext)) {

        throw new Error('Action "link_customer" is not permitted');

      }



      const metadata = appendTimelineEvent(input.record.metadata, {

        conversationId: input.record.id,

        type: "ownership_change",

        timestamp: new Date().toISOString(),

        actorId: access?.userId ?? null,

        actorLabel: null,

        summary: `Customer linked: ${input.customerName}`,

        payload: { customerId: input.customerId },

      });



      await linkCustomerViaBackend(services, context, {

        conversationId: input.record.id,

        customerId: input.customerId,

        companyId,

        metadata,

      });

    },

    onSuccess: (_, variables) => invalidate(variables.record.id, variables.record.customer_id),

  });



  const canPerform = useCallback(

    (record: ConversationRecord, action: LifecycleAction) =>

      conversationLifecycleCoordinator.canPerform(

        { record, permissionContext },

        action,

      ),

    [permissionContext],

  );



  const snapshot = useCallback(
    (
      record: ConversationRecord | null | undefined,
      enrichment?: Parameters<typeof getLifecycleSnapshot>[2],
    ) => {
      if (!record) return null;
      return getLifecycleSnapshot(record, permissionContext, enrichment);
    },
    [permissionContext],
  );



  const takeOver = useCallback(

    (record: ConversationRecord, userId: string, userLabel: string) =>

      transitionMutation.mutateAsync({

        record,

        action: "take_over",

        payload: {

          assignment: {

            targetType: "user",

            targetId: userId,

            targetLabel: userLabel,

            method: "manual",

            assignedByUserId: userId,

          },

          actorUserId: userId,

          actorLabel: userLabel,

        },

      }),

    [transitionMutation],

  );



  const assignTo = useCallback(

    (

      record: ConversationRecord,

      target: {

        targetType: "user" | "team" | "department" | "queue" | "ai_employee";

        targetId: string;

        targetLabel: string;

      },

      assignedByUserId: string | null,

      actorLabel: string | null = null,

    ) =>

      transitionMutation.mutateAsync({

        record,

        action: "assign",

        payload: {

          assignment: {

            targetType: target.targetType,

            targetId: target.targetId,

            targetLabel: target.targetLabel,

            method: target.targetType === "queue" ? "queue" : "manual",

            assignedByUserId,

          },

          queueId: target.targetType === "queue" ? target.targetId : undefined,

          actorUserId: assignedByUserId,

          actorLabel,

        },

      }),

    [transitionMutation],

  );



  const returnToAi = useCallback(

    (record: ConversationRecord, actorUserId: string | null, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "return_to_ai",

        payload: { actorUserId, actorLabel },

      }),

    [transitionMutation],

  );



  const escalate = useCallback(

    (record: ConversationRecord, payload: EscalationSubmitPayload, queueId?: string | null, actorLabel: string | null = null) => {

      const snap = getLifecycleSnapshot(record, permissionContext);

      return transitionMutation.mutateAsync({

        record,

        action: "escalate",

        payload: {

          escalation: {

            level: (snap.escalationHistory.length ?? 0) + 1,

            targetLevel: payload.escalateTo,

            targetOwnerKind: "user",

            targetOwnerId: null,

            reason: payload.reason,

            priority: payload.priority,

            notes: payload.notes,

            createdByUserId: access?.userId ?? null,

          },

          queueId: queueId ?? "escalated",

          actorUserId: access?.userId ?? null,

          actorLabel,

        },

      });

    },

    [transitionMutation, permissionContext, access?.userId],

  );



  const returnEscalation = useCallback(

    (record: ConversationRecord, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "return",

        payload: { actorUserId: access?.userId ?? null, actorLabel },

      }),

    [transitionMutation, access?.userId],

  );



  const cancelEscalation = useCallback(

    (record: ConversationRecord, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "escalation_cancel",

        payload: { actorUserId: access?.userId ?? null, actorLabel },

      }),

    [transitionMutation, access?.userId],

  );



  const resolveConversation = useCallback(

    (record: ConversationRecord, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "resolve",

        payload: { actorUserId: access?.userId ?? null, actorLabel },

      }),

    [transitionMutation, access?.userId],

  );



  const closeConversation = useCallback(

    (record: ConversationRecord, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "close",

        payload: { actorUserId: access?.userId ?? null, actorLabel },

      }),

    [transitionMutation, access?.userId],

  );



  const reopenConversation = useCallback(

    (record: ConversationRecord, actorLabel: string | null = null) =>

      transitionMutation.mutateAsync({

        record,

        action: "reopen",

        payload: { actorUserId: access?.userId ?? null, actorLabel },

      }),

    [transitionMutation, access?.userId],

  );



  const isPending =

    transitionMutation.isPending ||

    linkCustomer.isPending ||

    assign.isPending ||

    release.isPending ||

    close.isPending;



  return {

    permissionContext,

    canPerform,

    canLinkCustomer: permissionContext ? canLinkCustomer(permissionContext) : false,

    canCreateCustomer: permissionContext ? canCreateCustomer(permissionContext) : false,

    snapshot,

    takeOver,

    assignTo,

    returnToAi,

    escalate,

    returnEscalation,

    cancelEscalation,

    resolveConversation,

    closeConversation,

    reopenConversation,

    linkCustomer,

    transition: transitionMutation.mutateAsync,

    isPending,

    error: transitionMutation.error ?? linkCustomer.error,

  };

}


