"use client";

import { Button } from "@/shared/ui";
import { useReloadFromServer, useSaveLayout } from "../api/mutations";
import { useEditorStore } from "../model/editor-store-provider";
import { selectIsDirty, selectSaveStatus } from "../model/selectors";

/**
 * 헤더 우측: 상태 표시 + 저장 버튼 (PRD 9). 충돌이면 두 갈래 선택지를 인라인으로 보여준다.
 */
export function SaveControls() {
  const isDirty = useEditorStore(selectIsDirty);
  const status = useEditorStore(selectSaveStatus);
  const error = useEditorStore((s) => s.persistence.error);
  const dismiss = useEditorStore((s) => s.dismissSaveError);
  const { save, isPending } = useSaveLayout();
  const { reload, isPending: reloading } = useReloadFromServer();

  if (status === "conflict") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-amber-700">{error}</span>
        <Button variant="secondary" size="sm" onClick={reload} disabled={reloading}>
          {reloading ? "불러오는 중..." : "서버 버전 불러오기"}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          계속 편집
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {status === "error" ? <span className="text-red-600">{error}</span> : null}
      {status === "saving" ? (
        <span className="text-zinc-500">저장 중...</span>
      ) : isDirty ? (
        <span className="text-amber-600">● 저장되지 않은 변경사항</span>
      ) : (
        <span className="text-green-700">✓ 저장됨</span>
      )}
      <Button size="sm" onClick={save} disabled={!isDirty || isPending}>
        {status === "error" ? "다시 시도" : "저장"}
      </Button>
    </div>
  );
}
