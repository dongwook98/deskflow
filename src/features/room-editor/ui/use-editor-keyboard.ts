"use client";

import { useEffect } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/** 입력 중인 폼 요소에서는 단축키를 먹지 않는다 (PRD 부록: 입력창 포커스 중 Delete 무시). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * 단축키 (PRD 6.5, 7):
 * - Delete / Backspace : 선택 삭제
 * - Ctrl/Cmd + Z       : Undo
 * - Ctrl/Cmd + Shift+Z, Ctrl/Cmd + Y : Redo
 * Mac 은 metaKey, 그 외는 ctrlKey. 브라우저 기본 동작(뒤로가기 등)은 preventDefault.
 */
export function useEditorKeyboard() {
  const store = useEditorStoreApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.getState().redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
