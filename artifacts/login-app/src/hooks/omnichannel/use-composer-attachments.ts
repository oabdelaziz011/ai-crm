import { useCallback, useMemo, useState } from "react";
import {
  createPendingAttachment,
  revokePendingAttachment,
  type PendingAttachment,
} from "@/components/omnichannel/agent-desk/attachment-preview-strip";
import {
  resolveAttachmentKind,
  uploadPendingAttachments,
  validateComposerFiles,
} from "@/lib/omnichannel/services/conversation-attachment-service";
import type {
  ComposerPendingAttachment,
  ComposerUploadedAttachment,
} from "@/lib/omnichannel/types/composer-enterprise-types";

function toComposerPending(file: File): ComposerPendingAttachment {
  const base = createPendingAttachment(file);
  const kind = resolveAttachmentKind(file) ?? "file";
  return { ...base, kind, progress: 0 };
}

export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<ComposerPendingAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = [...files];
    setAttachments((current) => {
      const validation = validateComposerFiles([...current.map((item) => item.file), ...list]);
      if (!validation.ok) {
        setUploadError(validation.reason);
        return current;
      }
      setUploadError(null);
      return [...current, ...list.map(toComposerPending)];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) revokePendingAttachment(target as PendingAttachment);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      for (const item of current) revokePendingAttachment(item as PendingAttachment);
      return [];
    });
  }, []);

  const uploadAll = useCallback(
    async (companyId: string, conversationId: string): Promise<ComposerUploadedAttachment[]> => {
      if (attachments.length === 0) return [];
      setUploadError(null);
      setAttachments((current) => current.map((item) => ({ ...item, status: "uploading", progress: 0 })));
      try {
        const uploaded = await uploadPendingAttachments({
          companyId,
          conversationId,
          pending: attachments,
          onItemProgress: (id, progress) => {
            setAttachments((current) =>
              current.map((item) => (item.id === id ? { ...item, progress } : item)),
            );
          },
        });
        for (const item of attachments) revokePendingAttachment(item as PendingAttachment);
        setAttachments([]);
        return uploaded;
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "upload_failed");
        setAttachments((current) => current.map((item) => ({ ...item, status: "failed" })));
        throw error;
      }
    },
    [attachments],
  );

  const hasAttachments = attachments.length > 0;

  return useMemo(
    () => ({
      attachments,
      hasAttachments,
      uploadError,
      addFiles,
      removeAttachment,
      clearAttachments,
      uploadAll,
    }),
    [attachments, hasAttachments, uploadError, addFiles, removeAttachment, clearAttachments, uploadAll],
  );
}
