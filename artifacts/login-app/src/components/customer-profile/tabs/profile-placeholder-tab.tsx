import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  titleKey: string;
  descriptionKey: string;
  icon?: ReactNode;
};

export function ProfilePlaceholderTab({ titleKey, descriptionKey, icon }: Props) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        {icon ?? <Construction className="w-5 h-5 text-muted-foreground" />}
      </div>
      <h3 className="text-sm font-semibold">{t(titleKey)}</h3>
      <p className="text-xs text-muted-foreground mt-2 max-w-xs">{t(descriptionKey)}</p>
    </div>
  );
}
