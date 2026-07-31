import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import { UserCheck, UserMinus, XCircle } from "lucide-react";

type ConversationAssignmentProps = {
  assignedToMe: boolean;
  disabled?: boolean;
  takeoverLabel: string;
  releaseLabel: string;
  closeLabel: string;
  onAssign: () => void;
  onRelease: () => void;
  onClose: () => void;
};

export const ConversationAssignment = memo(function ConversationAssignment({
  assignedToMe,
  disabled,
  takeoverLabel,
  releaseLabel,
  closeLabel,
  onAssign,
  onRelease,
  onClose,
}: ConversationAssignmentProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Can permission="ai.conversations.takeover">
        <Button size="sm" variant="outline" disabled={disabled || assignedToMe} onClick={onAssign}>
          <UserCheck className="size-3.5" />
          {takeoverLabel}
        </Button>
      </Can>
      <Can permission="ai.conversations.release">
        <Button size="sm" variant="outline" disabled={disabled || !assignedToMe} onClick={onRelease}>
          <UserMinus className="size-3.5" />
          {releaseLabel}
        </Button>
      </Can>
      <Can permission="ai.conversations.reply">
        <Button size="sm" variant="outline" disabled={disabled} onClick={onClose}>
          <XCircle className="size-3.5" />
          {closeLabel}
        </Button>
      </Can>
    </div>
  );
});
