import type { RoomDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

/**
 * DB 행 → 응답 DTO. 변환은 여기서 끝낸다.
 * Route Handler 는 이 결과를 가공 없이 반환해야 서버 prefetch 와 클라이언트 fetch 의 hydration 모양이 같다.
 * created_by 는 내부용이라 DTO 에 넣지 않는다.
 */
export function toRoomDto(row: Tables<"rooms">): RoomDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    width: row.width,
    height: row.height,
    layoutVersion: row.layout_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
