"use client";

import { useEffect, type RefObject } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/**
 * 휠 = 줌 (PRD 8.1). React 의 onWheel 은 passive 라 preventDefault 가 안 먹어 페이지가 스크롤된다.
 * 그래서 addEventListener(..., { passive: false }) 로 직접 등록한다.
 * 휠 1틱 = 1단계, 커서 위치의 캔버스 점 고정.
 */
export function useCanvasWheel(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const rect = el.getBoundingClientRect();
      store
        .getState()
        .zoomStep(e.deltaY < 0 ? 1 : -1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store, svgRef]);
}
