import { useCallback, useEffect, useRef, useState } from "react";
import { rewriteDraftText, type RewriteMode } from "@/lib/omnichannel/services/ai-assist-service";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";

const MAX_HISTORY = 40;
const INPUT_DEBOUNCE_MS = 400;

type HistoryState = {
  entries: string[];
  index: number;
};

export function useAiAssistantEditorState(
  open: boolean,
  getDraftText: () => string,
  language: ResolvedConversationLanguage,
) {
  const [editorText, setEditorTextState] = useState("");
  const historyRef = useRef<HistoryState>({ entries: [""], index: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const inputDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [originalBeforeTranslate, setOriginalBeforeTranslate] = useState<string | null>(null);

  const bumpHistory = useCallback(() => {
    setHistoryVersion((value) => value + 1);
  }, []);

  const syncEditorFromHistory = useCallback(() => {
    const { entries, index } = historyRef.current;
    setEditorTextState(entries[index] ?? "");
  }, []);

  const pushHistory = useCallback(
    (next: string) => {
      const { entries, index } = historyRef.current;
      const base = entries.slice(0, index + 1);
      const updated = [...base, next].slice(-MAX_HISTORY);
      historyRef.current = { entries: updated, index: updated.length - 1 };
      setEditorTextState(next);
      bumpHistory();
    },
    [bumpHistory],
  );

  useEffect(() => {
    if (!open) return;
    const seed = getDraftText();
    historyRef.current = { entries: [seed], index: 0 };
    setEditorTextState(seed);
    setOriginalBeforeTranslate(null);
    bumpHistory();
  }, [open, getDraftText, bumpHistory]);

  useEffect(
    () => () => {
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
    },
    [],
  );

  const onEditorInput = useCallback(
    (next: string) => {
      setEditorTextState(next);
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
      inputDebounceRef.current = setTimeout(() => {
        const { entries, index } = historyRef.current;
        if (entries[index] === next) return;
        pushHistory(next);
      }, INPUT_DEBOUNCE_MS);
    },
    [pushHistory],
  );

  const commitEditorText = useCallback(
    (next: string) => {
      if (inputDebounceRef.current) {
        clearTimeout(inputDebounceRef.current);
        inputDebounceRef.current = null;
      }
      pushHistory(next);
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
      inputDebounceRef.current = null;
    }
    const { entries, index } = historyRef.current;
    if (index <= 0) return;
    historyRef.current = { entries, index: index - 1 };
    syncEditorFromHistory();
    bumpHistory();
  }, [bumpHistory, syncEditorFromHistory]);

  const redo = useCallback(() => {
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
      inputDebounceRef.current = null;
    }
    const { entries, index } = historyRef.current;
    if (index >= entries.length - 1) return;
    historyRef.current = { entries, index: index + 1 };
    syncEditorFromHistory();
    bumpHistory();
  }, [bumpHistory, syncEditorFromHistory]);

  const clear = useCallback(() => {
    commitEditorText("");
    setOriginalBeforeTranslate(null);
  }, [commitEditorText]);

  const replaceFromComposer = useCallback(() => {
    commitEditorText(getDraftText());
    setOriginalBeforeTranslate(null);
  }, [commitEditorText, getDraftText]);

  const applyRewrite = useCallback(
    (mode: RewriteMode) => {
      const rewritten = rewriteDraftText(editorText, mode, language);
      commitEditorText(rewritten);
    },
    [commitEditorText, editorText, language],
  );

  const applyImproveTone = useCallback(
    (improve: (text: string, lang: ResolvedConversationLanguage) => string) => {
      commitEditorText(improve(editorText, language));
    },
    [commitEditorText, editorText, language],
  );

  const applyTranslate = useCallback(() => {
    if (!editorText.trim()) return;
    if (originalBeforeTranslate === null) {
      setOriginalBeforeTranslate(editorText);
    }
    const mode: RewriteMode = language === "ar" ? "translate_ar" : "translate_en";
    commitEditorText(rewriteDraftText(editorText, mode, language));
  }, [commitEditorText, editorText, language, originalBeforeTranslate]);

  const restoreOriginal = useCallback(() => {
    if (originalBeforeTranslate === null) return;
    commitEditorText(originalBeforeTranslate);
    setOriginalBeforeTranslate(null);
  }, [commitEditorText, originalBeforeTranslate]);

  const loadSuggestion = useCallback(
    (text: string) => {
      commitEditorText(text);
      setOriginalBeforeTranslate(null);
    },
    [commitEditorText],
  );

  const { entries, index } = historyRef.current;
  void historyVersion;

  return {
    editorText,
    onEditorInput,
    canUndo: index > 0,
    canRedo: index < entries.length - 1,
    undo,
    redo,
    clear,
    replaceFromComposer,
    applyRewrite,
    applyImproveTone,
    applyTranslate,
    restoreOriginal,
    showRestoreOriginal: originalBeforeTranslate !== null,
    loadSuggestion,
  };
}
