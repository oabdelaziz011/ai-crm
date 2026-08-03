import {
  Banknote,
  CalendarPlus,
  FileText,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Printer,
  Share2,
  Sparkles,
  StickyNote,
  Upload,
  UserPlus,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const PRIMARY_ACTIONS = [
  { key: "call", icon: Phone, labelKey: "actions.call" },
  { key: "whatsapp", icon: MessageCircle, labelKey: "actions.whatsapp" },
  { key: "email", icon: Mail, labelKey: "actions.email" },
  { key: "sms", icon: MessageCircle, labelKey: "actions.sms" },
  { key: "collect", icon: Banknote, labelKey: "actions.collectPayment" },
  { key: "invoice", icon: FileText, labelKey: "actions.createInvoice" },
] as const;

const MORE_ACTIONS = [
  { key: "book", icon: CalendarPlus, labelKey: "actions.bookAgain" },
  { key: "reschedule", icon: CalendarPlus, labelKey: "actions.reschedule" },
  { key: "print", icon: Printer, labelKey: "actions.print" },
  { key: "share", icon: Share2, labelKey: "actions.share" },
  { key: "crm", icon: ExternalLink, labelKey: "actions.openCrm" },
  { key: "assign", icon: UserPlus, labelKey: "actions.assignEmployee" },
  { key: "note", icon: StickyNote, labelKey: "actions.addNote" },
  { key: "upload", icon: Upload, labelKey: "actions.uploadFile" },
  { key: "ai", icon: Sparkles, labelKey: "actions.aiAssistant" },
] as const;

export function Customer360QuickActions({ className }: { className?: string }) {
  const { t } = useTranslation("common");

  return (
    <div className={cn("sticky top-[var(--c360-header-h,7rem)] z-20 border-b border-border/50 bg-background/90 px-3 py-2 backdrop-blur-md", className)}>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {PRIMARY_ACTIONS.map(({ key, icon: Icon, labelKey }) => (
          <Button key={key} variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px]" disabled>
            <Icon className="size-3.5" />
            {t(`customer360.${labelKey}`)}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-[11px]">
              <MoreHorizontal className="size-3.5" />
              {t("customer360.actions.more")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {MORE_ACTIONS.map(({ key, icon: Icon, labelKey }) => (
              <DropdownMenuItem key={key} disabled>
                <Icon className="mr-2 size-3.5" />
                {t(`customer360.${labelKey}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
