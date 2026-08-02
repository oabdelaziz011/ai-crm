import type { ReactNode } from "react";
import { dirAttributeForField, dirAttributeForText, type LtrFieldKind } from "@/lib/omnichannel/presentation/text-direction";

type BiDirTextProps = {
  children: string;
  className?: string;
  as?: "span" | "p" | "dd" | "div";
  fieldKind?: LtrFieldKind;
  forceLtr?: boolean;
};

export function BiDirText({
  children,
  className,
  as: Tag = "span",
  fieldKind,
  forceLtr,
}: BiDirTextProps): ReactNode {
  const dir = fieldKind
    ? dirAttributeForField(children, fieldKind)
    : forceLtr
      ? "ltr"
      : dirAttributeForText(children);

  return (
    <Tag dir={dir} className={className}>
      {children}
    </Tag>
  );
}
