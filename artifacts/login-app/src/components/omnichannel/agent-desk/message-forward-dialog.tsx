import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConversationIdentityAvatar } from "@/components/omnichannel/workspace-v2/conversation-identity-avatar";
import { buildContactDisplayInput } from "@/lib/omnichannel/presentation/conversation-contact-identity";
import { resolveContactDisplayName } from "@/lib/omnichannel/presentation/contact-display";
import { resolveConversationIdentityAvatar } from "@/lib/omnichannel/presentation/conversation-identity-avatar";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type MessageForwardDialogProps = {
  open: boolean;
  preview: string;
  targets: UnifiedConversation[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (target: UnifiedConversation) => void;
};

function conversationLabel(target: UnifiedConversation, visitorLabel: string): string {
  return resolveContactDisplayName(
    buildContactDisplayInput(target, target.customer, visitorLabel),
  );
}

export function MessageForwardDialog({
  open,
  preview,
  targets,
  busy,
  onOpenChange,
  onSelect,
}: MessageForwardDialogProps) {
  const { t } = useTranslation();
  const visitorLabel = t("omnichannel.visitorLabel");
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      targets.filter((target) => {
        if (!trimmed) return true;
        const label = conversationLabel(target, visitorLabel).toLowerCase();
        const phone = target.customer?.phone?.toLowerCase() ?? "";
        const thread = target.externalThreadId?.toLowerCase() ?? "";
        const previewText = target.lastMessage?.toLowerCase() ?? "";
        const number = target.conversationNumber.toLowerCase();
        return (
          label.includes(trimmed) ||
          phone.includes(trimmed) ||
          thread.includes(trimmed) ||
          previewText.includes(trimmed) ||
          number.includes(trimmed)
        );
      }),
    [targets, trimmed, visitorLabel],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("omnichannel.experience.forwardTitle")}</DialogTitle>
          <DialogDescription>{t("omnichannel.experience.forwardHint")}</DialogDescription>
        </DialogHeader>
        <p className="line-clamp-3 rounded-md bg-[var(--ad-surface-2)] px-3 py-2 text-sm" dir="auto">
          {preview}
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("omnichannel.experience.forwardSearch")}
          className="w-full rounded-md border border-[var(--ad-border)] bg-transparent px-3 py-2 text-sm"
          dir="auto"
        />
        <div className="max-h-80 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-sm text-[var(--ad-text-muted)]" dir="auto">
              {t("omnichannel.experience.forwardEmpty")}
            </p>
          ) : (
            filtered.map((target) => {
              const label = conversationLabel(target, visitorLabel);
              const identity = resolveConversationIdentityAvatar({
                conversation: target,
                customer: target.customer,
                visitorLabel,
                expectedCompanyId: target.companyId,
              });
              return (
                <button
                  key={target.id}
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start hover:bg-[var(--ad-surface-2)] disabled:opacity-50"
                  onClick={() => onSelect(target)}
                >
                  <ConversationIdentityAvatar identity={identity} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" dir="auto">
                      {label}
                    </span>
                    <span className="block truncate text-xs text-[var(--ad-text-muted)]" dir="auto">
                      {target.lastMessage?.trim() || t("omnichannel.noPreview")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
