"use client";

import { Button } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";

export function ZoomControls() {
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const zoomStep = useEditorStore((s) => s.zoomStep);
  const fitToScreen = useEditorStore((s) => s.fitToScreen);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => zoomStep(-1)} aria-label="축소">
        −
      </Button>
      <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="sm" onClick={() => zoomStep(1)} aria-label="확대">
        +
      </Button>
      <Button variant="ghost" size="sm" onClick={fitToScreen}>
        맞춤
      </Button>
    </div>
  );
}
