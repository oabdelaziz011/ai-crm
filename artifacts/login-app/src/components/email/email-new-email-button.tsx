import { PenSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  size?: "default" | "sm";
};

export function EmailNewEmailButton({ onClick, disabled, busy, size = "default" }: Props) {
  const { t } = useTranslation("common");

  return (
    <Button
      type="button"
      size={size}
      className="shrink-0"
      data-testid="email-new-email"
      onClick={onClick}
      disabled={disabled || busy}
    >
      <PenSquare className="me-1.5 h-4 w-4" aria-hidden />
      {busy ? t("emailModule.workspace.composeStarting") : t("emailModule.workspace.newEmail")}
    </Button>
  );
}
