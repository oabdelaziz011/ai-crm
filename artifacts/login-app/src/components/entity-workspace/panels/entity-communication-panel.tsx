import { memo, useState } from "react";
import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useEntityWorkspace } from "@/context/entity-workspace-context";
import { CallService, ConversationService } from "@/lib/customer-profile/services";

export const EntityCommunicationPanel = memo(function EntityCommunicationPanel() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { customer, companyId, permissions, whatsapp, recordCommunication } = useEntityWorkspace();
  const [busy, setBusy] = useState<"whatsapp" | "call" | "email" | null>(null);

  if (!customer) return null;

  const channels = [
    permissions.canWhatsapp && whatsapp
      ? {
          id: "whatsapp" as const,
          icon: MessageCircle,
          label: "WhatsApp",
          action: async () => {
            setBusy("whatsapp");
            try {
              await ConversationService.openWhatsappConversation({
                customerId: customer.id,
                companyId,
                navigate: setLocation,
              });
              await recordCommunication("whatsapp");
            } catch {
              toast.error(t("entityWorkspace.communication.whatsappMissing"));
            } finally {
              setBusy(null);
            }
          },
        }
      : null,
    customer.email?.trim()
      ? {
          id: "email" as const,
          icon: Mail,
          label: t("dashboard.customerWorkspace.communication.email"),
          action: async () => {
            setBusy("email");
            try {
              window.open(`mailto:${customer.email}`, "_self");
              await recordCommunication("email");
            } finally {
              setBusy(null);
            }
          },
        }
      : null,
    permissions.canCall
      ? {
          id: "call" as const,
          icon: Phone,
          label: t("dashboard.customerWorkspace.communication.calls"),
          action: async () => {
            setBusy("call");
            try {
              CallService.initiateCall(customer.phone);
              await recordCommunication("call");
            } finally {
              setBusy(null);
            }
          },
        }
      : null,
  ].filter(Boolean) as Array<{
    id: "whatsapp" | "email" | "call";
    icon: typeof Phone;
    label: string;
    action: () => Promise<void>;
  }>;

  if (channels.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight">{t("entityWorkspace.panels.communication")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("entityWorkspace.communication.hint")}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {channels.map((channel) => {
          const Icon = channel.icon;
          return (
            <Button
              key={channel.id}
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              disabled={busy !== null}
              onClick={() => void channel.action()}
            >
              {busy === channel.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4 text-primary" />
              )}
              <span className="text-xs font-medium">{channel.label}</span>
            </Button>
          );
        })}
      </div>

      {whatsapp ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("entityWorkspace.communication.openExisting")}
        </p>
      ) : null}
    </section>
  );
});
