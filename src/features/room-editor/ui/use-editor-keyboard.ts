"use client";

import { useEffect } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/** 입력 중인 폼 요소에서는 단축키를 먹지 않는다 (PRD 부록: 입력창 포커스 중 Delete 무시). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** 이 단계에서는 Delete/Backspace 만. Task 6 에서 Undo/Redo 단축키 추가. */
export function useEditorKeyboard() {
  const store = useEditorStoreApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
