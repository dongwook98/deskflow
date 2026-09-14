"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import {
  EditorCanvas,
  EditorStoreProvider,
  EditorToolbar,
  HistoryControls,
  PropertiesPanel,
  SaveControls,
  ZoomControls,
  selectIsDirty,
  useEditorKeyboard,
  useEditorStore,
  useUnsavedChangesGuard,
} from "@/features/room-editor";

/** "← 공간 정보" : dirty 면 confirm. Next 라우터 이벤트가 없어 링크에서 직접 막는다. */
function BackLink({ roomId }: { roomId: string }) {
  const isDirty = useEditorStore(selectIsDirty);
  return (
    <Link
      href={`/admin/rooms/${roomId}`}
      className="text-sm text-zinc-600 hover:text-zinc-900"
      onClick={(e) => {
        if (
          isDirty &&
          !window.confirm("저장하지 않은 변경사항이 있습니다. 페이지를 나가시겠습니까?")
        ) {
          e.preventDefault();
        }
      }}
    >
      ← 공간 정보
    </Link>
  );
}

function EditorLayout({ roomId, roomName }: { roomId: string; roomName: string }) {
  useEditorKeyboard();
  useUnsavedChangesGuard();
  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col rounded-lg border border-zinc-200 bg-white">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-200 px-3">
        <BackLink roomId={roomId} />
        <h1 className="truncate font-medium">{roomName}</h1>
        <HistoryControls />
        <ZoomControls />
        <div className="ml-auto">
          <SaveControls />
        </div>
      </header>
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

/**
 * PRD 4.2 레이아웃. room 과 layout 은 페이지가 prefetch 해 두어 캐시 hit.
 * 모바일 Editor 는 범위 밖(PRD 부록) → md 미만에서는 안내만.
 */
export function EditorShell({ roomId }: { roomId: string }) {
  const { data: room } = useSuspenseQuery(roomQueries.detail(roomId));
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));

  return (
    <>
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 md:hidden">
        에디터는 데스크톱 화면에서 사용할 수 있습니다.
      </div>
      <div className="hidden md:block">
        <EditorStoreProvider layout={layout}>
          <EditorLayout roomId={roomId} roomName={room.name} />
        </EditorStoreProvider>
      </div>
    </>
  );
}
