import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TableRowActions({
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
  disabled,
}: {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={disabled || index === 0} onClick={onMoveUp}>
        <ChevronUp className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={disabled || index >= total - 1} onClick={onMoveDown}>
        <ChevronDown className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" disabled={disabled} onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
