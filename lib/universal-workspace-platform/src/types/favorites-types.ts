export type FavoriteItemType =
  | "customer"
  | "view"
  | "report"
  | "dashboard"
  | "task"
  | "project"
  | "command"
  | "workspace";

export type WorkspaceFavorite = {
  id: string;
  type: FavoriteItemType;
  label: string;
  href?: string;
  actionKey?: string;
  icon: string;
  pinnedAt: string;
};
