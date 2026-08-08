import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, Pin, PinOff, StickyNote, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { useEntityWorkspaceOptional } from "@/context/entity-workspace-context";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
import { EntityVirtualList } from "@/components/entity-workspace/entity-virtual-list";
import { NoteAttachmentItem } from "@/components/entity-workspace/panels/note-attachment-item";
import { NoteBodyText } from "@/components/entity-workspace/panels/note-body-text";
import { NoteMentionList } from "@/components/entity-workspace/panels/note-mention-list";
import {
  useCreateEntityNote,
  useEntityNotes,
  useSetEntityNotePinned,
} from "@/hooks/entity-workspace/use-entity-notes";
import type { EntityNote, EntityNoteFilterId, EntityNoteVisibility, EntityWorkspaceModuleId } from "@/lib/entity-workspace";
import {
  ENTITY_NOTE_MAX_ATTACHMENTS,
  validateEntityNoteFiles,
} from "@/lib/entity-workspace/services/entity-file-upload";
import { filterEntityNotes } from "@/lib/entity-workspace/services/note-filters";
import {
  extractNoteMentions,
  filterMentionTargets,
  insertMentionToken,
  listNoteMentionTargets,
  parseMentionQuery,
  type NoteMentionTarget,
} from "@/lib/entity-workspace/services/note-mentions";
import { cn } from "@/lib/utils";

type Props = {
  entityType?: string;
  entityId?: string;
  operationId?: string | null;
  sourceModule?: EntityWorkspaceModuleId;
  searchQuery?: string;
  dense?: boolean;
  composerOpen?: boolean;
};

type StagedFile = {
  id: string;
  file: File;
  /** Local object URL for composer thumbnail only — never used as Storage preview. */
  localPreview?: string;
};

const NOTE_FILTERS: ReadonlyArray<{ id: EntityNoteFilterId; labelKey: string; defaultLabel: string }> = [
  { id: "all", labelKey: "entityWorkspace.notes.filters.all", defaultLabel: "All" },
  { id: "mine", labelKey: "entityWorkspace.notes.filters.mine", defaultLabel: "My Notes" },
  { id: "pinned", labelKey: "entityWorkspace.notes.filters.pinned", defaultLabel: "Pinned" },
  { id: "attachments", labelKey: "entityWorkspace.notes.filters.attachments", defaultLabel: "With Attachments" },
  { id: "today", labelKey: "entityWorkspace.notes.filters.today", defaultLabel: "Today" },
  { id: "week", labelKey: "entityWorkspace.notes.filters.week", defaultLabel: "This Week" },
];

export const EntityNotesPanel = memo(function EntityNotesPanel({
  entityType,
  entityId,
  operationId,
  sourceModule = "operations",
  searchQuery = "",
  dense,
  composerOpen,
}: Props) {
  const { t } = useTranslation("common");
  const { company, profile, user } = useAuth();
  const workspace = useEntityWorkspaceOptional();
  const standaloneNotes = useEntityNotes(
    workspace ? "" : (entityType ?? ""),
    workspace ? "" : (entityId ?? ""),
  );
  const createStandalone = useCreateEntityNote(entityType ?? "customer", entityId ?? "");
  const setPinnedStandalone = useSetEntityNotePinned(
    entityType ?? "customer",
    entityId ?? "",
  );

  const notes: EntityNote[] = workspace?.notes ?? standaloneNotes.data ?? [];
  const canCreate = workspace ? workspace.permissions.canCreateNotes : true;
  const displayName = workspace?.currentUser.displayName ?? null;
  const focusNoteId = workspace?.focusNoteId ?? null;
  const highlightedNoteId = workspace?.highlightedNoteId ?? null;
  const currentUserId = workspace?.currentUser.id || user?.id || null;

  const tenantId = workspace?.companyId || company?.id || profile?.company_id || "";

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<EntityNoteVisibility>("both");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [dismissedExternal, setDismissedExternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    percent: number;
    fileIndex: number;
    fileCount: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [noteFilter, setNoteFilter] = useState<EntityNoteFilterId>("all");
  const [cursor, setCursor] = useState(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openComposer = (Boolean(composerOpen) && !dismissedExternal) || showComposer;
  const isLoading = workspace ? false : standaloneNotes.isLoading;

  const canSave = Boolean(text.trim()) && canCreate && !pending;

  const mentionQuery = useMemo(() => parseMentionQuery(text, cursor), [text, cursor]);
  const mentionOpen = mentionQuery !== null && !mentionDismissed;

  const mentionTargetsQuery = useQuery({
    queryKey: ["entity-note-mention-targets", tenantId],
    enabled: Boolean(tenantId) && openComposer,
    staleTime: 60_000,
    queryFn: () => listNoteMentionTargets(tenantId),
  });
  const allMentionTargets = mentionTargetsQuery.data ?? [];
  const mentionTargets = useMemo(
    () => filterMentionTargets(allMentionTargets, mentionOpen ? mentionQuery : null),
    [allMentionTargets, mentionOpen, mentionQuery],
  );

  useEffect(() => {
    setMentionDismissed(false);
    setMentionHighlight(0);
  }, [mentionQuery]);

  useEffect(() => {
    if (composerOpen) setDismissedExternal(false);
  }, [composerOpen]);

  useEffect(() => {
    if (!focusNoteId) return;
    const attachments = document.getElementById(`entity-note-${focusNoteId}-attachments`);
    const card = document.getElementById(`entity-note-${focusNoteId}`);
    (attachments ?? card)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusNoteId, notes]);

  useEffect(() => {
    return () => {
      for (const item of stagedFiles) {
        if (item.localPreview) URL.revokeObjectURL(item.localPreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  const closeComposer = () => {
    setShowComposer(false);
    setDismissedExternal(true);
  };

  const resetComposer = () => {
    for (const item of stagedFiles) {
      if (item.localPreview) URL.revokeObjectURL(item.localPreview);
    }
    setTitle("");
    setText("");
    setCursor(0);
    setMentionHighlight(0);
    setMentionDismissed(false);
    setVisibility("both");
    setStagedFiles([]);
    setUploadProgress(null);
  };

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => {
      const haystack = [
        note.title ?? "",
        note.text,
        note.createdByName ?? "",
        ...note.attachments.map((a) => `${a.fileName} ${a.fileType}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [notes, searchQuery]);

  const filtered = useMemo(
    () => filterEntityNotes(searched, noteFilter, currentUserId),
    [searched, noteFilter, currentUserId],
  );

  const mentionHint = t("entityWorkspace.notes.mentionHint", { defaultValue: "" });
  const composerPlaceholder = mentionHint
    ? `${t("entityWorkspace.notes.placeholder")} ${mentionHint}`
    : t("entityWorkspace.notes.placeholder", {
        defaultValue: "Write a note… Use @ to mention someone",
      });

  const selectMention = (target: NoteMentionTarget) => {
    const result = insertMentionToken(text, cursor, target);
    setText(result.text);
    setCursor(result.cursor);
    setMentionHighlight(0);
    setMentionDismissed(true);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMentionDismissed(true);
      return;
    }

    if (mentionTargets.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionHighlight((current) => (current + 1) % mentionTargets.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionHighlight((current) => (current - 1 + mentionTargets.length) % mentionTargets.length);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const target = mentionTargets[mentionHighlight];
      if (target) selectMention(target);
    }
  };

  const syncCursor = (node: HTMLTextAreaElement) => {
    setCursor(node.selectionStart ?? node.value.length);
  };

  const addFiles = (incoming: FileList | File[]) => {
    if (!canCreate) return;
    const list = Array.from(incoming);
    const combined = [...stagedFiles.map((item) => item.file), ...list];
    if (combined.length > ENTITY_NOTE_MAX_ATTACHMENTS) {
      toast.error(t("entityWorkspace.notes.attachError.too_many"));
      return;
    }
    const validation = validateEntityNoteFiles(list);
    if (!validation.ok) {
      toast.error(
        t(`entityWorkspace.notes.attachError.${validation.reason}`, {
          defaultValue: validation.message,
        }),
      );
      return;
    }
    setStagedFiles((prev) => [
      ...prev,
      ...validation.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        localPreview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const hit = prev.find((item) => item.id === id);
      if (hit?.localPreview) URL.revokeObjectURL(hit.localPreview);
      return prev.filter((item) => item.id !== id);
    });
  };

  const onSubmit = async () => {
    if (!canSave) return;
    const trimmed = text.trim();
    const mentions = extractNoteMentions(trimmed, allMentionTargets);
    const files = stagedFiles.map((item) => item.file);
    setPending(true);
    setUploadProgress(
      files.length > 0
        ? { fileName: files[0]!.name, percent: 0, fileIndex: 0, fileCount: files.length }
        : null,
    );
    try {
      const progressHandler = (event: {
        fileName: string;
        percent: number;
        fileIndex: number;
        fileCount: number;
      }) => {
        setUploadProgress(event);
      };

      if (workspace) {
        await workspace.createNote({
          text: trimmed,
          title: title.trim() || null,
          visibility,
          sourceModule,
          mentions,
          files,
          onUploadProgress: progressHandler,
        });
      } else {
        if (!entityType || !entityId) throw new Error("Missing entity");
        await createStandalone.mutateAsync({
          text: trimmed,
          title: title.trim() || null,
          visibility,
          operationId,
          sourceModule,
          mentions,
          files,
          onUploadProgress: progressHandler,
        });
      }
      resetComposer();
      closeComposer();
      toast.success(t("entityWorkspace.notes.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("entityWorkspace.notes.saveError"));
    } finally {
      setPending(false);
      setUploadProgress(null);
    }
  };

  const onTogglePin = async (note: EntityNote) => {
    const pinned = note.pinned ?? false;
    setPinningId(note.id);
    try {
      if (workspace) {
        await workspace.setNotePinned(note.id, !pinned);
      } else {
        await setPinnedStandalone.mutateAsync({ noteId: note.id, pinned: !pinned });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("entityWorkspace.notes.saveError"));
    } finally {
      setPinningId(null);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (!canCreate) return;
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  };

  return (
    <section
      className={
        dense
          ? "rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
          : "rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {t("entityWorkspace.notes.activityTitle")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("entityWorkspace.notes.sharedHint")}</p>
        </div>
        {canCreate ? (
          <Button size="sm" variant="outline" onClick={() => setShowComposer((v) => !v)}>
            {t("entityWorkspace.notes.add")}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {NOTE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setNoteFilter(filter.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              noteFilter === filter.id
                ? "border-primary/30 bg-primary/12 text-primary"
                : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t(filter.labelKey, { defaultValue: filter.defaultLabel })}
          </button>
        ))}
      </div>

      {openComposer && canCreate ? (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("entityWorkspace.notes.titlePlaceholder")}
            className="h-9 border-border/60 bg-card"
          />
          <div className="relative">
            {mentionOpen ? (
              <NoteMentionList
                targets={mentionTargets}
                highlightIndex={mentionHighlight}
                emptyLabel={t("entityWorkspace.notes.mentionEmpty", {
                  defaultValue: "No matching people",
                })}
                onSelect={selectMention}
              />
            ) : null}
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                syncCursor(event.target);
              }}
              onClick={(event) => syncCursor(event.currentTarget)}
              onKeyUp={(event) => syncCursor(event.currentTarget)}
              onSelect={(event) => syncCursor(event.currentTarget)}
              onKeyDown={onTextareaKeyDown}
              placeholder={composerPlaceholder}
              className="min-h-[96px] resize-y border-border/60 bg-card"
              autoFocus
            />
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
              dragOver ? "border-primary bg-primary/10" : "border-border/70 bg-card/80",
            )}
          >
            <Upload className="mx-auto size-5 text-primary" />
            <p className="mt-2 text-sm font-medium">{t("entityWorkspace.notes.dropTitle")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("entityWorkspace.notes.dropHint")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="me-1.5 size-3.5" />
              {t("entityWorkspace.notes.upload")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                if (event.target.files?.length) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {stagedFiles.length > 0 ? (
            <ul className="space-y-2">
              {stagedFiles.map((item) => (
                <li key={item.id} className="rounded-xl border border-border/50 bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    {item.localPreview ? (
                      <img src={item.localPreview} alt="" className="size-8 rounded-md object-cover" />
                    ) : (
                      <Paperclip className="size-4 text-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{item.file.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t("entityWorkspace.notes.stagedReady", {
                          defaultValue: "Ready — uploads when you save",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      onClick={() => removeStagedFile(item.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {uploadProgress ? (
            <div className="rounded-xl border border-primary/20 bg-card px-3 py-2">
              <p className="truncate text-xs font-medium">
                {t("entityWorkspace.notes.uploading")} {uploadProgress.fileName}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {uploadProgress.fileIndex + 1}/{uploadProgress.fileCount} · {uploadProgress.percent}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("entityWorkspace.notes.visibilityLabel")}
            </span>
            {(
              [
                ["operations", "entityWorkspace.notes.visibility.operations"],
                ["crm", "entityWorkspace.notes.visibility.crm"],
                ["both", "entityWorkspace.notes.visibility.both"],
              ] as const
            ).map(([value, labelKey]) => (
              <button
                key={value}
                type="button"
                onClick={() => setVisibility(value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  visibility === value
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={closeComposer} disabled={pending}>
              {t("buttons.cancel")}
            </Button>
            <Button size="sm" onClick={() => void onSubmit()} disabled={!canSave}>
              {pending ? (
                <>
                  <Loader2 className="me-1.5 size-4 animate-spin" />
                  {uploadProgress
                    ? t("entityWorkspace.notes.uploading")
                    : t("entityWorkspace.notes.save")}
                </>
              ) : (
                t("entityWorkspace.notes.save")
              )}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <StickyNote className="size-6 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">{t("entityWorkspace.notes.emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("entityWorkspace.notes.emptyDescription")}</p>
          </div>
        ) : (
          <EntityVirtualList
            items={filtered}
            rowHeight={168}
            getKey={(note) => note.id}
            renderItem={(note) => (
              <NoteCard
                note={note}
                displayName={displayName}
                highlighted={highlightedNoteId === note.id || focusNoteId === note.id}
                pinning={pinningId === note.id}
                onTogglePin={() => void onTogglePin(note)}
              />
            )}
          />
        )}
      </div>
    </section>
  );
});

function NoteCard({
  note,
  displayName,
  highlighted,
  pinning,
  onTogglePin,
}: {
  note: EntityNote;
  displayName: string | null;
  highlighted: boolean;
  pinning: boolean;
  onTogglePin: () => void;
}) {
  const { t } = useTranslation("common");
  const when = formatNoteWhen(note.createdAt);
  const pinned = note.pinned ?? false;
  const mentions = note.mentions ?? [];

  return (
    <article
      id={`entity-note-${note.id}`}
      className={cn(
        "mb-3 rounded-xl border bg-background/80 px-4 py-3 transition-shadow",
        highlighted
          ? "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]"
          : "border-border/50",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <EmployeeIdentityCard
              className="min-w-0 flex-1"
              userId={note.createdBy}
              fallbackName={note.createdByName ?? displayName}
              showEmail
              showJobTitle
              meta={when}
            />
            <div className="flex shrink-0 items-center gap-1">
              {pinned ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Pin className="size-2.5" />
                  {t("entityWorkspace.notes.pinnedBadge", { defaultValue: "Pinned" })}
                </span>
              ) : null}
              <button
                type="button"
                disabled={pinning}
                onClick={onTogglePin}
                title={
                  pinned
                    ? t("entityWorkspace.notes.unpin", { defaultValue: "Unpin" })
                    : t("entityWorkspace.notes.pin", { defaultValue: "Pin" })
                }
                aria-label={
                  pinned
                    ? t("entityWorkspace.notes.unpin", { defaultValue: "Unpin" })
                    : t("entityWorkspace.notes.pin", { defaultValue: "Pin" })
                }
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full border transition-colors",
                  pinned
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
                  pinning && "opacity-60",
                )}
              >
                {pinning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : pinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
              </button>
            </div>
          </div>
          {note.title ? <p className="mt-2 text-sm font-semibold">{note.title}</p> : null}
          <NoteBodyText text={note.text} mentions={mentions} className="mt-1" />
          <div id={`entity-note-${note.id}-attachments`} className="mt-2">
            {note.attachments.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {note.attachments.map((file) => (
                  <li key={file.id}>
                    <NoteAttachmentItem file={file} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatNoteWhen(iso: string): string {
  const date = new Date(iso);
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today • ${time}`;
  if (isYesterday(date)) return `Yesterday • ${time}`;
  return `${format(date, "MMM d")} • ${time}`;
}
