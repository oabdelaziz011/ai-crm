import {
  endOfDay,
  endOfWeek,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { EntityNote, EntityNoteFilterId } from "../types";
import { compareEntityNotesNewestFirst } from "./note-meta";

export function filterEntityNotes(
  notes: readonly EntityNote[],
  filter: EntityNoteFilterId,
  currentUserId: string | null | undefined,
): EntityNote[] {
  const now = new Date();
  const filtered = notes.filter((note) => {
    switch (filter) {
      case "mine":
        return Boolean(currentUserId && note.createdBy === currentUserId);
      case "pinned":
        return note.pinned;
      case "attachments":
        return note.attachments.length > 0;
      case "today": {
        const created = parseISO(note.createdAt);
        return isWithinInterval(created, { start: startOfDay(now), end: endOfDay(now) });
      }
      case "week": {
        const created = parseISO(note.createdAt);
        return isWithinInterval(created, {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        });
      }
      case "all":
      default:
        return true;
    }
  });

  return [...filtered].sort(compareEntityNotesNewestFirst);
}
