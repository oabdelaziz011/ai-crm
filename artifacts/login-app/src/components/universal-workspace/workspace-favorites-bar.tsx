import { memo } from "react";
import { Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import { translateFavoriteLabel } from "@/lib/i18n/workspace-mock-labels";
import { cn } from "@/lib/utils";

export const WorkspaceFavoritesBar = memo(function WorkspaceFavoritesBar() {
  const { t } = useTranslation("common");
  const { snapshot, unpinFavorite } = useWorkspacePlatform();
  const favorites = snapshot?.favorites ?? [];

  if (favorites.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <Star className="size-3.5 shrink-0 text-amber-500" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {t("workspacePlatform.favorites.title")}
      </span>
      {favorites.map((fav) => (
        <span
          key={fav.id}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-medium",
            "transition-colors hover:border-primary/40 hover:bg-primary/5",
          )}
        >
          {translateFavoriteLabel(t, fav.id, fav.label)}
          <button
            type="button"
            onClick={() => unpinFavorite(fav.id)}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={t("workspacePlatform.favorites.unpin")}
          >
            <X className="size-3 text-muted-foreground" />
          </button>
        </span>
      ))}
    </div>
  );
});
