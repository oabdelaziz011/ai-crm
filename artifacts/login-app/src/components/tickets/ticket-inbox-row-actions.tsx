import {
  MoreHorizontal,
  UserPlus,
  Eye,
  RefreshCw,
  Flag,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { noteNestedOverlayActivity } from "@/lib/ui/prevent-dialog-dismiss-for-nested-overlay";

export function TicketInboxRowActions({
  canAssign,
  canChangeStatus,
  canChangePriority,
  canClose,
  canReopen,
  isTerminal,
  onViewDetails,
  onAssign,
  onChangeStatus,
  onChangePriority,
  onCloseTicket,
  onReopenTicket,
  t,
}: {
  canAssign: boolean;
  canChangeStatus: boolean;
  canChangePriority: boolean;
  canClose: boolean;
  canReopen: boolean;
  isTerminal: boolean;
  onViewDetails: () => void;
  onAssign: () => void;
  onChangeStatus: () => void;
  onChangePriority: () => void;
  onCloseTicket: () => void;
  onReopenTicket: () => void;
  t: (key: string, opts?: Record<string, string>) => string;
}) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) noteNestedOverlayActivity();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t("tickets.actions.menu")}
          data-testid="ticket-row-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[12rem] rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          className="gap-2 rounded-lg"
          onSelect={() => {
            noteNestedOverlayActivity();
            onViewDetails();
          }}
        >
          <Eye className="size-3.5" aria-hidden />
          {t("tickets.actions.viewDetails")}
        </DropdownMenuItem>
        {canAssign ? (
          <DropdownMenuItem
            className="gap-2 rounded-lg"
            onSelect={() => {
              noteNestedOverlayActivity();
              onAssign();
            }}
          >
            <UserPlus className="size-3.5" aria-hidden />
            {t("tickets.actions.assign")}
          </DropdownMenuItem>
        ) : null}
        {canChangeStatus || canChangePriority || canClose || canReopen ? (
          <DropdownMenuSeparator />
        ) : null}
        {canChangeStatus ? (
          <DropdownMenuItem
            className="gap-2 rounded-lg"
            onSelect={() => {
              noteNestedOverlayActivity();
              onChangeStatus();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t("tickets.actions.changeStatus")}
          </DropdownMenuItem>
        ) : null}
        {canChangePriority ? (
          <DropdownMenuItem
            className="gap-2 rounded-lg"
            onSelect={() => {
              noteNestedOverlayActivity();
              onChangePriority();
            }}
          >
            <Flag className="size-3.5" aria-hidden />
            {t("tickets.actions.changePriority")}
          </DropdownMenuItem>
        ) : null}
        {canClose && !isTerminal ? (
          <DropdownMenuItem
            className="gap-2 rounded-lg"
            onSelect={() => {
              noteNestedOverlayActivity();
              onCloseTicket();
            }}
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t("tickets.actions.closeTicket")}
          </DropdownMenuItem>
        ) : null}
        {canReopen && isTerminal ? (
          <DropdownMenuItem
            className="gap-2 rounded-lg"
            onSelect={() => {
              noteNestedOverlayActivity();
              onReopenTicket();
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t("tickets.actions.reopenTicket")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
