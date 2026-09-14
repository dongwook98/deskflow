"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { screenToCanvas } from "../lib/geometry";
import { useEditorStoreApi } from "../model/editor-store-provider";
import type { Point } from "../model/types";

/**
 * 캔버스 포인터 제스처: 선택, 드래그, 팬.
 *
 * - 좌표: clientX/Y → svg 좌상단 기준 화면 좌표 → screenToCanvas → 캔버스 좌표
 * - 드래그: grabOffset(잡은 지점 - 좌상단) 을 기억, 매 move 마다 절대 위치 계산 (오차 누적 없음)
 * - 팬: Space 누른 채 드래그 또는 휠 클릭(button 1). 화면 좌표 delta 를 offset 에 더한다
 * Space 눌림은 스토어가 아니라 이 훅의 상태(D-23). 커서 표시용으로만 밖에 노출.
 */
export function useCanvasPointer(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); // 페이지 스크롤 방지
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toScreen = useCallback(
    (e: ReactPointerEvent): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [svgRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      const screen = toScreen(e);
      // 포인터가 svg 밖으로 나가도 move/up 을 계속 받는다
      e.currentTarget.setPointerCapture(e.pointerId);

      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        s.setInteraction({ type: "pan", lastScreen: screen });
        setIsPanning(true);
        return;
      }
      if (e.button !== 0) return;

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
    [store, toScreen, spaceHeld],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      const it = s.interaction;
      if (it.type === "drag") {
        const canvas = screenToCanvas(toScreen(e), s.viewport);
        s.moveObject(it.id, { x: canvas.x - it.grabOffset.x, y: canvas.y - it.grabOffset.y });
      } else if (it.type === "pan") {
        const screen = toScreen(e);
        s.panBy(screen.x - it.lastScreen.x, screen.y - it.lastScreen.y);
        s.setInteraction({ type: "pan", lastScreen: screen });
      }
    },
    [store, toScreen],
  );

  const onPointerUp = useCallback(() => {
    const s = store.getState();
    if (s.interaction.type === "drag") s.endGesture(); // 드래그 1회 = 히스토리 1단계
    if (s.interaction.type !== "idle") s.setInteraction({ type: "idle" });
    setIsPanning(false);
  }, [store]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    isPanning,
    spaceHeld,
  };
}
