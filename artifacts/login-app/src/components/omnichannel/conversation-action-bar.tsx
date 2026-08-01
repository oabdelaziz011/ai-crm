import { memo, useState } from "react";
import {
  ArrowUpCircle,
  Bot,
  CheckCircle2,
  MoreHorizontal,
  Reply,
  RotateCcw,
  UserCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can } from "@/components/rbac/permission-guard";

type ConversationActionBarProps = {
  assignedToMe: boolean;
  disabled?: boolean;
  escalated?: boolean;
  isClosed?: boolean;
  canAssign?: boolean;
  canRelease?: boolean;
  canClose?: boolean;
  canResolve?: boolean;
  canReopen?: boolean;
  canEscalate?: boolean;
  labels: {
    reply: string;
    assign: string;
    status: string;
    ai: string;
    escalate: string;
    close: string;
    resolve: string;
    reopen: string;
    release: string;
    returnConversation: string;
    cancelEscalation: string;
    more: string;
  };
  onFocusComposer: () => void;
  onAssign: () => void;
  onRelease: () => void;
  onClose: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onEscalate: () => void;
  onReturnConversation: () => void;
  onCancelEscalation: () => void;
  onOpenAi: () => void;
};

export const ConversationActionBar = memo(function ConversationActionBar({
  assignedToMe,
  disabled,
  escalated,
  isClosed,
  canAssign = true,
  canRelease = true,
  canClose = true,
  canResolve = true,
  canReopen = true,
  canEscalate = true,
  labels,
  onFocusComposer,
  onAssign,
  onRelease,
  onClose,
  onResolve,
  onReopen,
  onEscalate,
  onReturnConversation,
  onCancelEscalation,
  onOpenAi,
}: ConversationActionBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5"
      role="toolbar"
      aria-label="Conversation actions"
    >
      {!isClosed ? (
        <Button size="sm" className="h-8 gap-1.5 px-3" disabled={disabled} onClick={onFocusComposer}>
          <Reply className="size-3.5" />
          {labels.reply}
        </Button>
      ) : null}

      {!isClosed ? (
        <Can permission="ai.conversations.takeover">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 px-3"
            disabled={disabled || assignedToMe || !canAssign}
            onClick={onAssign}
          >
            <UserCheck className="size-3.5" />
            {labels.assign}
          </Button>
        </Can>
      ) : null}

      {isClosed && canReopen ? (
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 px-3" disabled={disabled} onClick={onReopen}>
          <RotateCcw className="size-3.5" />
          {labels.reopen}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 px-3" disabled={disabled}>
            {labels.status}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {!isClosed && canResolve ? (
            <DropdownMenuItem disabled={disabled} onClick={onResolve}>
              <CheckCircle2 className="size-3.5" />
              {labels.resolve}
            </DropdownMenuItem>
          ) : null}
          <Can permission="ai.conversations.reply">
            <DropdownMenuItem disabled={disabled || !canClose} onClick={onClose}>
              <XCircle className="size-3.5" />
              {labels.close}
            </DropdownMenuItem>
          </Can>
          {!isClosed ? (
            <Can permission="ai.conversations.release">
              <DropdownMenuItem disabled={disabled || !assignedToMe || !canRelease} onClick={onRelease}>
                {labels.release}
              </DropdownMenuItem>
            </Can>
          ) : null}
          {!isClosed && canEscalate ? (
            <DropdownMenuItem disabled={disabled} onClick={onEscalate}>
              <ArrowUpCircle className="size-3.5" />
              {labels.escalate}
            </DropdownMenuItem>
          ) : null}
          {escalated ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={disabled} onClick={onReturnConversation}>
                <RotateCcw className="size-3.5" />
                {labels.returnConversation}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onClick={onCancelEscalation}>
                {labels.cancelEscalation}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3" disabled={disabled} onClick={onOpenAi}>
        <Bot className="size-3.5" />
        {labels.ai}
      </Button>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 px-2" aria-label={labels.more}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{labels.status}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem disabled={disabled || !canClose} onClick={onClose}>{labels.close}</DropdownMenuItem>
              <DropdownMenuItem disabled={disabled || !canRelease} onClick={onRelease}>{labels.release}</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
