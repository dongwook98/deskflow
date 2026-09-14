import type { EditorDocument, EditorHistory } from "../model/types";

/** 스냅샷 방식이라 문서 참조만 쌓인다. 100 단계면 수백 오브젝트 문서도 메모리 부담 없음. */
export const HISTORY_LIMIT = 100;

export const emptyHistory: EditorHistory = { past: [], future: [] };

/** 새 변경 발생: 직전 문서를 past 에 넣고 future(redo 분기)는 버린다. */
export function pushHistory(
  history: EditorHistory,
  snapshot: EditorDocument,
  limit = HISTORY_LIMIT,
): EditorHistory {
  const past = [...history.past, snapshot];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undoHistory(
  history: EditorHistory,
  current: EditorDocument,
): { history: EditorHistory; document: EditorDocument } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    document: previous,
  };
}

export function redoHistory(
  history: EditorHistory,
  current: EditorDocument,
): { history: EditorHistory; document: EditorDocument } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    document: next,
  };
}
