import { memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const EMOJI_CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌", "🤝",
      "🙏", "💪", "🫶", "👊", "✊", "🤛", "🤜", "👈", "👉", "👆", "👇", "☝️", "✍️", "🤳", "💅", "🫡",
    ],
  },
  {
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "💟", "♥️", "😻", "💐", "🌹", "🥀", "🌸", "🌺", "🌻", "🌷", "✨", "⭐", "🌟", "💫",
    ],
  },
  {
    label: "Objects",
    emojis: [
      "📎", "📌", "📍", "📞", "☎️", "📧", "📨", "📩", "📤", "📥", "📦", "📅", "📆", "🗓️", "⏰", "⏳",
      "⌛", "🔔", "🔕", "📣", "📢", "💬", "💭", "🗨️", "📝", "✏️", "📋", "📁", "📂", "🗂️", "📊", "📈",
    ],
  },
  {
    label: "Status",
    emojis: [
      "✅", "☑️", "✔️", "❌", "❎", "⚠️", "🚫", "⛔", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚪", "⚫",
      "🎉", "🎊", "🎁", "🏆", "🥇", "🎯", "💯", "🔥", "💥", "❗", "❓", "‼️", "⁉️", "💡", "🔍", "🔒",
    ],
  },
];

type EmojiPickerGridProps = {
  onSelect: (emoji: string) => void;
};

export const EmojiPickerGrid = memo(function EmojiPickerGrid({ onSelect }: EmojiPickerGridProps) {
  return (
    <ScrollArea className="h-56 w-72">
      <div className="space-y-2 p-1">
        {EMOJI_CATEGORIES.map((category) => (
          <div key={category.label}>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]">
              {category.label}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {category.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded p-1 text-lg leading-none hover:bg-[var(--ad-accent-dim)]"
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
});
