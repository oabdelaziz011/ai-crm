import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  onSignOut: () => void;
};

export function UserMenu({ onSignOut }: UserMenuProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { displayName, user } = useAuth();

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-1.5 py-1 outline-none transition-colors",
            "hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={t("appShell.userMenu.label")}
        >
          <Avatar className="size-8 border-2 border-primary/20 shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="hidden size-3 text-muted-foreground lg:block" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/settings/profile")}>
          <User className="me-2 size-4" aria-hidden="true" />
          {t("dashboard.settings.nav.personalProfile")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation("/settings")}>
          <Settings className="me-2 size-4" aria-hidden="true" />
          {t("navigation.settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="me-2 size-4" aria-hidden="true" />
          {t("buttons.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
