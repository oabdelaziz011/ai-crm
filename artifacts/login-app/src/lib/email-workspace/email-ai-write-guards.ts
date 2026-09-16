/** Pure draft-apply guards (no network / env). */
export function shouldApplyEmailAiDraft(input: {
  requestToken: number;
  currentToken: number;
  composerBodyAtRequest: string;
  currentComposerBody: string;
}): boolean {
  if (input.requestToken !== input.currentToken) return false;
  // If user edited body while AI ran, do not blindly replace.
  if (input.composerBodyAtRequest !== input.currentComposerBody) return false;
  return true;
}
