"use client";

import { useEffect } from "react";
import { useEditorStore } from "../model/editor-store-provider";
import { selectIsDirty } from "../model/selectors";

/**
 * dirty 상태에서 새로고침/탭 닫기/외부 이동 시 브라우저 확인창 (PRD 9 이탈 경고).
 * 앱 내 Link 이동은 Next 가 라우터 이벤트를 제공하지 않으므로 "← 공간 정보" 링크에서 confirm 으로 처리한다(widget).
 */
export function useUnsavedChangesGuard() {
  const isDirty = useEditorStore(selectIsDirty);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 커스텀 문구를 무시하지만 returnValue 설정이 확인창을 띄우는 조건
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
