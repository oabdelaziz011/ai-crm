export type GlobalSearchResultType =
  | "customer"
  | "lead"
  | "company"
  | "employee"
  | "invoice"
  | "payment"
  | "booking"
  | "task"
  | "project"
  | "ticket"
  | "asset"
  | "file"
  | "email"
  | "whatsapp"
  | "note"
  | "command"
  | "setting";

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  preview: string;
  icon: string;
  href?: string;
  actionKey?: string;
  score: number;
};

export type GlobalSearchGroup = {
  type: GlobalSearchResultType;
  labelKey: string;
  results: GlobalSearchResult[];
};
