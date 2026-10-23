import { useLayoutEffect, useRef } from "react";
import { renderLinkedTextHtml } from "@/lib/ai-employees/utilities/linkify-text";

function readEditorText(element: HTMLDivElement): string {
  return element.innerText.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
}

export function SystemPromptEditor({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  const paint = (text: string) => {
    const element = ref.current;
    if (!element) return;
    element.innerHTML = renderLinkedTextHtml(text);
  };

  useLayoutEffect(() => {
    if (focused.current) return;
    paint(value);
  }, [value]);

  return (
    <div
      id={id}
      ref={ref}
      role="textbox"
      aria-multiline="true"
      dir="auto"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ""}
      className="min-h-56 w-full whitespace-pre-wrap break-words rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const text = ref.current ? readEditorText(ref.current) : value;
        onChange(text);
        paint(text);
      }}
      onInput={() => {
        if (!ref.current) return;
        onChange(readEditorText(ref.current));
      }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor?.getAttribute("href");
        if (!href) return;
        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
    />
  );
}
