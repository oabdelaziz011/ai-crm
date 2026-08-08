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

export type Customer360QuickActionKey =
  | "call"
  | "whatsapp"
  | "email"
  | "sms"
  | "collect"
  | "invoice"
  | "book"
  | "reschedule"
  | "print"
  | "share"
  | "crm"
  | "assign"
  | "note"
  | "upload"
  | "ai";

const PRIMARY_ACTIONS = [
  { key: "call" as const, icon: Phone, labelKey: "actions.call" },
  { key: "whatsapp" as const, icon: MessageCircle, labelKey: "actions.whatsapp" },
  { key: "email" as const, icon: Mail, labelKey: "actions.email" },
  { key: "sms" as const, icon: MessageCircle, labelKey: "actions.sms" },
  { key: "collect" as const, icon: Banknote, labelKey: "actions.collectPayment" },
  { key: "invoice" as const, icon: FileText, labelKey: "actions.createInvoice" },
];

const MORE_ACTIONS = [
  { key: "book" as const, icon: CalendarPlus, labelKey: "actions.bookAgain" },
  { key: "reschedule" as const, icon: CalendarPlus, labelKey: "actions.reschedule" },
  { key: "print" as const, icon: Printer, labelKey: "actions.print" },
  { key: "share" as const, icon: Share2, labelKey: "actions.share" },
  { key: "crm" as const, icon: ExternalLink, labelKey: "actions.openCrm" },
  { key: "assign" as const, icon: UserPlus, labelKey: "actions.assignEmployee" },
  { key: "note" as const, icon: StickyNote, labelKey: "actions.addNote" },
  { key: "upload" as const, icon: Upload, labelKey: "actions.uploadFile" },
  { key: "ai" as const, icon: Sparkles, labelKey: "actions.aiAssistant" },
];

const WIRED_PRIMARY: Customer360QuickActionKey[] = ["call", "whatsapp", "collect", "invoice"];
const WIRED_MORE: Customer360QuickActionKey[] = ["crm"];

export function Customer360QuickActions({
  className,
  onAction,
  ready = false,
  canCollect = false,
  canInvoice = false,
}: {
  className?: string;
  onAction?: (action: Customer360QuickActionKey) => void;
  ready?: boolean;
  canCollect?: boolean;
  canInvoice?: boolean;
}) {
  const { t } = useTranslation("common");

  const isPrimaryEnabled = (key: Customer360QuickActionKey) => {
    if (!ready || !onAction || !WIRED_PRIMARY.includes(key)) return false;
    if (key === "collect") return canCollect;
    if (key === "invoice") return canInvoice;
    return true;
  };

  return (
    <div className={cn("sticky top-[var(--c360-header-h,7rem)] z-20 border-b border-border/50 bg-background/90 px-3 py-2 backdrop-blur-md", className)}>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {PRIMARY_ACTIONS.map(({ key, icon: Icon, labelKey }) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
            disabled={!isPrimaryEnabled(key)}
            onClick={() => onAction?.(key)}
          >
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
              <DropdownMenuItem
                key={key}
                disabled={!ready || !onAction || !WIRED_MORE.includes(key)}
                onClick={() => onAction?.(key)}
              >
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
