import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from "react";

export type KanbanDragState = {
  cardId: string | null;
  fromColumnId: string | null;
  overColumnId: string | null;
  isDragging: boolean;
};

type UseKanbanDndOptions = {
  onMove: (input: { cardId: string; fromColumnId: string; toColumnId: string }) => void;
  onMoveSuccess?: () => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function useKanbanDnd({ onMove, onMoveSuccess, scrollContainerRef }: UseKanbanDndOptions) {
  const [drag, setDrag] = useState<KanbanDragState>({
    cardId: null,
    fromColumnId: null,
    overColumnId: null,
    isDragging: false,
  });
  const autoScrollRaf = useRef<number | null>(null);
  const pointerX = useRef(0);

  const clearAutoScroll = useCallback(() => {
    if (autoScrollRaf.current != null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    const el = scrollContainerRef?.current;
    if (!el || !drag.isDragging) {
      clearAutoScroll();
      return;
    }
    const rect = el.getBoundingClientRect();
    const edge = 64;
    let delta = 0;
    if (pointerX.current < rect.left + edge) delta = -14;
    if (pointerX.current > rect.right - edge) delta = 14;
    if (delta !== 0) el.scrollLeft += delta;
    autoScrollRaf.current = requestAnimationFrame(tickAutoScroll);
  }, [clearAutoScroll, drag.isDragging, scrollContainerRef]);

  useEffect(() => {
    if (!drag.isDragging) {
      clearAutoScroll();
      return;
    }
    autoScrollRaf.current = requestAnimationFrame(tickAutoScroll);
    return clearAutoScroll;
  }, [clearAutoScroll, drag.isDragging, tickAutoScroll]);

  useEffect(() => {
    if (!drag.isDragging) return;
    const onMovePointer = (event: DragEvent) => {
      pointerX.current = event.clientX;
    };
    window.addEventListener("dragover", onMovePointer);
    return () => window.removeEventListener("dragover", onMovePointer);
  }, [drag.isDragging]);

  const onCardDragStart = useCallback((cardId: string, columnId: string, event: ReactDragEvent) => {
    event.dataTransfer.setData("text/kanban-card-id", cardId);
    event.dataTransfer.setData("text/kanban-from-column", columnId);
    event.dataTransfer.effectAllowed = "move";
    setDrag({
      cardId,
      fromColumnId: columnId,
      overColumnId: columnId,
      isDragging: true,
    });
  }, []);

  const onColumnDragOver = useCallback((columnId: string, event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    pointerX.current = event.clientX;
    setDrag((prev) =>
      prev.isDragging && prev.overColumnId !== columnId
        ? { ...prev, overColumnId: columnId }
        : prev,
    );
  }, []);

  const onColumnDrop = useCallback(
    (columnId: string, event: ReactDragEvent) => {
      event.preventDefault();
      const cardId =
        event.dataTransfer.getData("text/kanban-card-id") ||
        event.dataTransfer.getData("leadId");
      const fromColumnId = event.dataTransfer.getData("text/kanban-from-column");
      if (cardId && fromColumnId && fromColumnId !== columnId) {
        onMove({ cardId, fromColumnId, toColumnId: columnId });
        onMoveSuccess?.();
      }
      setDrag({
        cardId: null,
        fromColumnId: null,
        overColumnId: null,
        isDragging: false,
      });
    },
    [onMove, onMoveSuccess],
  );

  const onDragEnd = useCallback(() => {
    setDrag({
      cardId: null,
      fromColumnId: null,
      overColumnId: null,
      isDragging: false,
    });
  }, []);

  return {
    drag,
    onCardDragStart,
    onColumnDragOver,
    onColumnDrop,
    onDragEnd,
  };
}
