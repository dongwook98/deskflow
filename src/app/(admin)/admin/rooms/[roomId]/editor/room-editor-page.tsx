"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import {
  EditorCanvas,
  EditorStoreProvider,
  EditorToolbar,
  HistoryControls,
  PropertiesPanel,
  ZoomControls,
  useEditorKeyboard,
} from "@/features/room-editor";

// Task 9 에서 widgets/room-editor 로 교체되는 임시 조립
function EditorBody() {
  useEditorKeyboard();
  return (
    <div className="flex h-[80vh] flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex h-12 items-center gap-3 border-b border-zinc-200 px-3">
        <HistoryControls />
        <ZoomControls />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[140px_1fr_260px]">
        <aside className="border-r border-zinc-200">
          <EditorToolbar />
        </aside>
        <EditorCanvas />
        <aside className="overflow-y-auto border-l border-zinc-200">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}

export function RoomEditorPage({ roomId }: { roomId: string }) {
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  return (
    <EditorStoreProvider layout={layout}>
      <EditorBody />
    </EditorStoreProvider>
  );
}
