import { memo, useCallback, useState } from "react";

import { format } from "date-fns";

import { Check, Pencil, Trash2, X } from "lucide-react";

import type { UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";

import type { Profile } from "@/lib/types";

import { resolveAgentDisplayNameFromProfile, looksLikeEmail } from "@/lib/omnichannel/presentation/agent-display-name";



export type InternalNotesPanelLabels = {

  empty: string;

  author: string;

  edit: string;

  delete: string;

  save: string;

  cancel: string;

  deleteConfirm: string;

  editedBy: string;

  editedAt: string;

  versionHistory: string;

  conversationScoped: string;

};



type InternalNotesPanelProps = {

  notes: UnifiedMessage[];

  profilesByUserId: ReadonlyMap<string, Profile>;

  canManage?: boolean;

  labels: InternalNotesPanelLabels;

  onEditNote?: (messageId: string, originalBody: string, nextBody: string) => Promise<void>;

  onDeleteNote?: (messageId: string) => Promise<void>;

  isManaging?: boolean;

};



function resolveNoteAuthor(note: UnifiedMessage, profilesByUserId: ReadonlyMap<string, Profile>): string {

  const agentUserId = typeof note.source.metadata?.agentUserId === "string" ? note.source.metadata.agentUserId : null;

  const profile = agentUserId

    ? [...profilesByUserId.values()].find((entry) => entry.id === agentUserId || entry.user_id === agentUserId)

    : undefined;

  const raw = note.senderLabel?.trim();

  if (profile) {

    return resolveAgentDisplayNameFromProfile(profile, raw).display;

  }

  if (raw && !looksLikeEmail(raw)) return raw;

  return resolveAgentDisplayNameFromProfile(undefined, raw).display;

}



function readEditedMeta(note: UnifiedMessage) {

  const meta = note.source.metadata ?? {};

  const editedAt = typeof meta.editedAt === "string" ? meta.editedAt : null;

  const editedByLabel = typeof meta.editedByLabel === "string" ? meta.editedByLabel : null;

  const history = Array.isArray(meta.noteHistory) ? meta.noteHistory : [];

  return { editedAt, editedByLabel, history };

}



export const InternalNotesPanel = memo(function InternalNotesPanel({

  notes,

  profilesByUserId,

  canManage = false,

  labels,

  onEditNote,

  onDeleteNote,

  isManaging = false,

}: InternalNotesPanelProps) {

  const [editingId, setEditingId] = useState<string | null>(null);

  const [draft, setDraft] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);



  const startEdit = useCallback((note: UnifiedMessage) => {

    setEditingId(note.id);

    setDraft(note.body);

    setConfirmDeleteId(null);

  }, []);



  const cancelEdit = useCallback(() => {

    setEditingId(null);

    setDraft("");

  }, []);



  const saveEdit = useCallback(async () => {

    if (!editingId || !onEditNote) return;

    const original = notes.find((note) => note.id === editingId);

    if (!original) return;

    await onEditNote(editingId, original.body, draft);

    setEditingId(null);

    setDraft("");

  }, [draft, editingId, notes, onEditNote]);



  const confirmDelete = useCallback(async (messageId: string) => {

    if (!onDeleteNote) return;

    await onDeleteNote(messageId);

    setConfirmDeleteId(null);

    if (editingId === messageId) cancelEdit();

  }, [cancelEdit, editingId, onDeleteNote]);



  if (notes.length === 0) {

    return (

      <div className="rounded-lg border border-dashed border-[var(--ws-border)] px-3 py-8 text-center">

        <p className="text-xs text-[var(--ws-muted)]">{labels.empty}</p>

      </div>

    );

  }



  return (

    <div className="space-y-3">

      <p className="text-[10px] text-[var(--ws-muted)]">{labels.conversationScoped}</p>

      <ul className="space-y-3">

        {notes.map((note) => {

          const author = resolveNoteAuthor(note, profilesByUserId);

          const created = new Date(note.timestamp);

          const { editedAt, editedByLabel, history } = readEditedMeta(note);

          const isEditing = editingId === note.id;

          const isConfirmingDelete = confirmDeleteId === note.id;



          return (

            <li

              key={note.id}

              className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 shadow-sm"

            >

              <div className="mb-2 flex items-start justify-between gap-2">

                <div className="min-w-0">

                  <p className="text-xs font-semibold">{author}</p>

                  <p className="text-[10px] tabular-nums text-[var(--ws-muted)]">

                    {format(created, "MMM d, yyyy")} · {format(created, "p")}

                  </p>

                  {editedAt ? (

                    <p className="text-[10px] text-[var(--ws-muted)]">

                      {labels.editedBy} {editedByLabel ?? labels.author} · {labels.editedAt}{" "}

                      {format(new Date(editedAt), "MMM d, p")}

                    </p>

                  ) : null}

                </div>

                {canManage && onEditNote && onDeleteNote ? (

                  <div className="flex shrink-0 gap-1">

                    {isEditing ? (

                      <>

                        <button

                          type="button"

                          className="ws-btn ws-btn--ghost p-1"

                          title={labels.save}

                          aria-label={labels.save}

                          disabled={isManaging || !draft.trim()}

                          onClick={() => void saveEdit()}

                        >

                          <Check className="size-3.5" />

                        </button>

                        <button

                          type="button"

                          className="ws-btn ws-btn--ghost p-1"

                          title={labels.cancel}

                          aria-label={labels.cancel}

                          disabled={isManaging}

                          onClick={cancelEdit}

                        >

                          <X className="size-3.5" />

                        </button>

                      </>

                    ) : (

                      <>

                        <button

                          type="button"

                          className="ws-btn ws-btn--ghost p-1"

                          title={labels.edit}

                          aria-label={labels.edit}

                          disabled={isManaging}

                          onClick={() => startEdit(note)}

                        >

                          <Pencil className="size-3.5" />

                        </button>

                        <button

                          type="button"

                          className="ws-btn ws-btn--ghost p-1 text-red-400"

                          title={labels.delete}

                          aria-label={labels.delete}

                          disabled={isManaging}

                          onClick={() => setConfirmDeleteId(note.id)}

                        >

                          <Trash2 className="size-3.5" />

                        </button>

                      </>

                    )}

                  </div>

                ) : null}

              </div>



              {isEditing ? (

                <textarea

                  className="w-full rounded-md border border-[var(--ws-border)] bg-[var(--ws-surface)] p-2 text-xs leading-relaxed"

                  rows={4}

                  value={draft}

                  disabled={isManaging}

                  onChange={(event) => setDraft(event.target.value)}

                />

              ) : (

                <p className="whitespace-pre-wrap text-xs leading-relaxed">{note.body}</p>

              )}



              {isConfirmingDelete ? (

                <div className="mt-2 flex items-center gap-2">

                  <p className="flex-1 text-[10px] text-red-300">{labels.deleteConfirm}</p>

                  <button

                    type="button"

                    className="ws-btn ws-btn--ghost px-2 py-1 text-[10px]"

                    disabled={isManaging}

                    onClick={() => setConfirmDeleteId(null)}

                  >

                    {labels.cancel}

                  </button>

                  <button

                    type="button"

                    className="ws-btn px-2 py-1 text-[10px] text-red-300"

                    disabled={isManaging}

                    onClick={() => void confirmDelete(note.id)}

                  >

                    {labels.delete}

                  </button>

                </div>

              ) : null}



              {history.length > 0 ? (

                <details className="mt-2">

                  <summary className="cursor-pointer text-[10px] text-[var(--ws-muted)]">

                    {labels.versionHistory} ({history.length})

                  </summary>

                  <ul className="mt-1 space-y-2 border-s border-[var(--ws-border)] ps-2">

                    {history.map((entry, index) => (

                      <li key={`${note.id}-history-${index}`} className="text-[10px] text-[var(--ws-muted)]">

                        <p className="whitespace-pre-wrap">{entry.body}</p>

                        {entry.editedAt ? (

                          <p className="mt-0.5 tabular-nums">

                            {entry.editedByLabel ?? labels.author} · {format(new Date(entry.editedAt), "MMM d, p")}

                          </p>

                        ) : null}

                      </li>

                    ))}

                  </ul>

                </details>

              ) : null}

            </li>

          );

        })}

      </ul>

    </div>

  );

});


