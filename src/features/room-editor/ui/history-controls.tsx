"use client";

import { Button } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";
import { selectCanRedo, selectCanUndo } from "../model/selectors";

export function HistoryControls() {
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
        ↶ 실행 취소
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={redo}
        disabled={!canRedo}
        title="다시 실행 (Ctrl+Shift+Z)"
      >
        ↷ 다시 실행
      </Button>
    </div>
  );
}
