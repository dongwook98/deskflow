"use client";

import { EditorShell } from "@/widgets/room-editor";

export function RoomEditorPage({ roomId }: { roomId: string }) {
  return <EditorShell roomId={roomId} />;
}
