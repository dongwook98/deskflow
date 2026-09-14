"use client";

import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { screenToCanvas } from "../lib/geometry";
import { useEditorStoreApi } from "../model/editor-store-provider";
import type { Point } from "../model/types";

/**
 * 캔버스 포인터 제스처. 이 단계에서는 선택 + 드래그. (Task 7 에서 팬 추가)
 *
 * 좌표 흐름: clientX/Y → svg 좌상단 기준 화면 좌표 → screenToCanvas → 캔버스 좌표.
 * 드래그는 "잡은 지점의 오프셋(grabOffset)" 을 기억해 두고 매 move 마다
 * 좌상단 = 현재 캔버스 좌표 - grabOffset 으로 계산한다. delta 누적이 아니라 절대값이라 오차가 안 쌓인다.
 */
export function useCanvasPointer(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();

  const toScreen = useCallback(
    (e: ReactPointerEvent): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [svgRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const s = store.getState();
      const screen = toScreen(e);
      // 포인터가 svg 밖으로 나가도 move/up 을 계속 받는다
      e.currentTarget.setPointerCapture(e.pointerId);

      const target = (e.target as Element).closest("[data-object-id]");
      const id = target?.getAttribute("data-object-id") ?? null;
      if (!id) {
        s.select(null); // 빈 곳 클릭 = 선택 해제 (PRD 6.3)
        return;
      }
      const object = s.document.objects[id];
      if (!object) return;

      const canvas = screenToCanvas(screen, s.viewport);
      s.select(id);
      s.beginGesture();
      s.setInteraction({
        type: "drag",
        id,
        grabOffset: { x: canvas.x - object.x, y: canvas.y - object.y },
      });
    },
    [store, toScreen],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      if (s.interaction.type !== "drag") return;
      const canvas = screenToCanvas(toScreen(e), s.viewport);
      s.moveObject(s.interaction.id, {
        x: canvas.x - s.interaction.grabOffset.x,
        y: canvas.y - s.interaction.grabOffset.y,
      });
    },
    [store, toScreen],
  );

  const onPointerUp = useCallback(() => {
    const s = store.getState();
    if (s.interaction.type === "drag") s.endGesture(); // 드래그 1회 = 히스토리 1단계
    if (s.interaction.type !== "idle") s.setInteraction({ type: "idle" });
  }, [store]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    isPanning: false,
  };
}
