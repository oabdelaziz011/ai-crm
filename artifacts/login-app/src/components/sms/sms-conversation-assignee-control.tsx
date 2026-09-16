import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  ConversationNotFoundError,
  PermissionDeniedError,
  type ConversationRecord,
} from "@workspace/ai-conversation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useConversationServices } from "@/lib/ai-conversation";
import { useAssignableEmployees } from "@/hooks/assignment-governance/use-assignable-employees";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useToast } from "@/hooks/use-toast";
import { buildAssignableEmailSelectOptions } from "@/lib/assignment-governance/assignable-select-options";
import {
  assignedUserIdFromEmailConversationSelectValue,
  isEmailConversationAssignable,
  patchConversationAssigneeCacheData,
  persistEmailConversationAssignee,
  selectValueForEmailConversationAssignee,
} from "@/lib/email-workspace/email-conversation-assignment";
import { cn } from "@/lib/utils";

type Props = {
  conversation: Pick<ConversationRecord, "id" | "assigned_user_id" | "state" | "deleted_at">;
  companyId: string;
  canAssign: boolean;
  className?: string;
};

export function SmsConversationAssigneeControl({
  conversation,
  companyId,
  canAssign,
  className,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();
  const [saving, setSaving] = useState(false);
  const [pendingAssignedUserId, setPendingAssignedUserId] = useState<string | null | undefined>(
    undefined,
  );

  const displayedAssignedUserId =
    pendingAssignedUserId === undefined ? conversation.assigned_user_id : pendingAssignedUserId;

  const assignableQuery = useAssignableEmployees({
    enabled: Boolean(companyId && canAssign),
    resource: "conversation",
  });

  const currentIdentityQuery = useEmployeeIdentity(displayedAssignedUserId);
  const employees = assignableQuery.data ?? [];
  const matched = employees.find((row) => row.userId === displayedAssignedUserId?.trim());
  const assigneeName =
    matched?.fullName ?? currentIdentityQuery.data?.fullName ?? null;

  const unassignedLabel = t("smsModule.workspace.unassigned");
  const options = useMemo(
    () =>
      buildAssignableEmailSelectOptions({
        employees,
        assignedUserId: displayedAssignedUserId,
        assignedLabel: assigneeName,
        unassignedLabel,
      }),
    [employees, displayedAssignedUserId, assigneeName, unassignedLabel],
  );

  const selectValue = selectValueForEmailConversationAssignee(displayedAssignedUserId);
  const assignable = isEmailConversationAssignable(conversation);

  const applyCaches = (assignedUserId: string | null) => {
    queryClient.setQueriesData({ queryKey: ["conversation-list", companyId] }, (data) =>
      patchConversationAssigneeCacheData(data, conversation.id, assignedUserId),
    );
  };

  const onChange = async (value: string) => {
    if (!canAssign || saving) return;
    const nextAssigned = assignedUserIdFromEmailConversationSelectValue(value);
    const previous = conversation.assigned_user_id ?? null;
    if (previous === nextAssigned) return;
    if (!assignable) {
      toast({ title: t("smsModule.workspace.assigneeUnavailable"), variant: "destructive" });
      return;
    }

    setSaving(true);
    setPendingAssignedUserId(nextAssigned);
    applyCaches(nextAssigned);
    try {
      // ConversationService (takeover / release + Assignment Governance) stays authoritative.
      const saved = await persistEmailConversationAssignee({
        services: services.conversations,
        context,
        conversation,
        assignedUserId: nextAssigned,
      });
      applyCaches(saved.assigned_user_id);
      setPendingAssignedUserId(saved.assigned_user_id);
      toast({ title: t("smsModule.workspace.assigneeSaved") });
    } catch (error) {
      applyCaches(previous);
      setPendingAssignedUserId(previous);
      const unauthorized = error instanceof PermissionDeniedError;
      const missing =
        error instanceof ConversationNotFoundError ||
        (error instanceof Error && error.message === "CONVERSATION_UNAVAILABLE");
      toast({
        title: missing
          ? t("smsModule.workspace.assigneeUnavailable")
          : unauthorized
            ? t("smsModule.workspace.assigneeUnauthorized")
            : t("smsModule.workspace.assigneeSaveFailed"),
        description:
          error instanceof Error && !unauthorized && !missing ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setPendingAssignedUserId(undefined);
    }
  };

  return (
    <div className={cn("min-w-[12rem]", className)} data-testid="sms-assignee-control">
      <div className="mb-1 text-[11px] text-muted-foreground">
        {t("smsModule.workspace.assignedTo")}
        {saving ? <Loader2 className="ms-1 inline h-3 w-3 animate-spin" /> : null}
      </div>
      <SearchableSelect
        value={selectValue}
        onValueChange={(value) => void onChange(value)}
        options={options}
        disabled={!canAssign || saving || assignableQuery.isLoading || !assignable}
        placeholder={unassignedLabel}
        searchPlaceholder={t("smsModule.workspace.assigneeSearch")}
        emptyLabel={t("smsModule.workspace.assigneeEmpty")}
        className="h-8 rounded-lg px-2.5 text-xs"
      />
    </div>
  );
}
