"use client";

import { useEffect, useMemo, useRef } from "react";
import { orderedObjects } from "../lib/document";
import { useEditorStore } from "../model/editor-store-provider";
import { SpaceObjectView } from "./space-object-view";
import { useCanvasPointer } from "./use-canvas-pointer";

/**
 * 캔버스 본체. svg 하나에 <g transform="translate(offset) scale(zoom)"> 로 뷰포트를 표현한다.
 * 오브젝트 좌표는 전부 캔버스 단위 그대로 쓰고 변환은 이 g 가 담당 → 오브젝트 컴포넌트는 zoom 을 모른다.
 */
export function EditorCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const document = useEditorStore((s) => s.document);
  const viewport = useEditorStore((s) => s.viewport);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setViewportSize = useEditorStore((s) => s.setViewportSize);
  const objects = useMemo(() => orderedObjects(document), [document]);
  const { handlers, isPanning } = useCanvasPointer(svgRef);

  // 캔버스 DOM 크기를 스토어에 보고. 최초 보고에서 스토어가 fit 을 수행한다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const report = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setViewportSize]);

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full touch-none select-none bg-zinc-100 ${isPanning ? "cursor-grabbing" : ""}`}
      {...handlers}
    >
      <g transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.zoom})`}>
        {/* room 영역. 여기를 클릭하면 선택 해제 */}
        <rect
          width={document.width}
          height={document.height}
          fill="white"
          stroke="#d4d4d8"
          vectorEffect="non-scaling-stroke"
        />
        {objects.map((o) => (
          <SpaceObjectView key={o.id} object={o} selected={o.id === selectedId} />
        ))}
      </g>
    </svg>
  );
}
