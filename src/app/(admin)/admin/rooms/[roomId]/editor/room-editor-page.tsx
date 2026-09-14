"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import { EditorCanvas, EditorStoreProvider } from "@/features/room-editor";

// Task 9 에서 widgets/room-editor 로 교체되는 임시 조립
export function RoomEditorPage({ roomId }: { roomId: string }) {
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  return (
    <EditorStoreProvider layout={layout}>
      <div className="h-[70vh] rounded-lg border border-zinc-200 bg-white">
        <EditorCanvas />
      </div>
    </EditorStoreProvider>
  );
}
