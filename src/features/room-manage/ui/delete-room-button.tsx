"use client";

import { Button } from "@/shared/ui";
import { useDeleteRoom } from "../api/mutations";

/** 브라우저 confirm 으로 충분한 MVP 범위. 커스텀 다이얼로그는 필요해질 때. */
export function DeleteRoomButton({ roomId, roomName }: { roomId: string; roomName: string }) {
  const remove = useDeleteRoom();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(`"${roomName}" 공간을 삭제할까요? 배치와 좌석이 함께 삭제됩니다.`)) {
          remove.mutate(roomId);
        }
      }}
    >
      삭제
    </Button>
  );
}
