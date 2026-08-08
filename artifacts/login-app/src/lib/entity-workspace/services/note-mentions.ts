import {
  extractMentionsFromText,
  filterMentionTargets,
  formatMentionToken,
  listComposerMentionTargets,
  mentionHandle,
  parseMentionQuery,
} from "@/lib/omnichannel/services/composer-mention-service";
import type { ComposerMentionTarget } from "@/lib/omnichannel/types/composer-enterprise-types";
import type { EntityNoteMention } from "../types";

export {
  filterMentionTargets,
  formatMentionToken,
  listComposerMentionTargets,
  mentionHandle,
  parseMentionQuery,
};

export type NoteMentionTarget = ComposerMentionTarget;

/** Prefer agents for note mentions; keep teams searchable too. */
export function listNoteMentionTargets(companyId: string): Promise<NoteMentionTarget[]> {
  return listComposerMentionTargets(companyId);
}

export function extractNoteMentions(
  text: string,
  targets: NoteMentionTarget[],
): EntityNoteMention[] {
  return extractMentionsFromText(text, targets).map((mention) => ({
    userId: mention.targetId,
    handle: mention.handle,
    label: mention.label,
    targetType: mention.targetType,
  }));
}

export function insertMentionToken(
  text: string,
  cursor: number,
  target: NoteMentionTarget,
): { text: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const replaced = before.replace(/(?:^|\s)@([\w\u0600-\u06FF.-]*)$/u, (match) => {
    const prefix = match.startsWith("@") ? "" : match[0] ?? "";
    return `${prefix}${formatMentionToken(target)} `;
  });
  const next = `${replaced}${after}`;
  return { text: next, cursor: replaced.length };
}
