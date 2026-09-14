"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import {
  EditorCanvas,
  EditorStoreProvider,
  EditorToolbar,
  PropertiesPanel,
  useEditorKeyboard,
} from "@/features/room-editor";

// Task 9 에서 widgets/room-editor 로 교체되는 임시 조립
function EditorBody() {
  useEditorKeyboard();
  return (
    <div className="grid h-[75vh] grid-cols-[140px_1fr_260px] rounded-lg border border-zinc-200 bg-white">
      <aside className="border-r border-zinc-200">
        <EditorToolbar />
      </aside>
      <EditorCanvas />
      <aside className="overflow-y-auto border-l border-zinc-200">
        <PropertiesPanel />
      </aside>
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
