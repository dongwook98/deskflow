import { ROTATIONS, type Rotation, type SpaceObjectDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

/** `space_objects.select("*, seats(*)")` 의 행. seats 는 unique FK 라 PostgREST 가 객체(1:1)로 돌려준다. */
export type SpaceObjectRowWithSeat = Tables<"space_objects"> & { seats: Tables<"seats"> | null };

/** DB 의 float8 rotation 을 계약의 90° 단위 리터럴로. 잘못 저장된 값도 UI 가 깨지지 않게 정규화. */
export function toRotation(n: number): Rotation {
  // 가장 가까운 90° 배수로 반올림한 뒤 [0, 360) 으로 접는다. 음수도 처리 (-90 → 270)
  const rounded = Math.round(n / 90) * 90;
  const value = ((rounded % 360) + 360) % 360;
  return (ROTATIONS as readonly number[]).includes(value) ? (value as Rotation) : 0;
}

export function toSpaceObjectDto(row: SpaceObjectRowWithSeat): SpaceObjectDto {
  const common = {
    id: row.id,
    roomId: row.room_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: toRotation(row.rotation),
    zIndex: row.z_index,
  };

  switch (row.type) {
    case "seat": {
      if (!row.seats) {
        // save_room_layout 이 항상 seats 를 같이 쓰므로 정상 경로에선 도달하지 않는다
        throw new Error(`seat 오브젝트 ${row.id} 에 seats 행이 없습니다.`);
      }
      return {
        ...common,
        type: "seat",
        seat: { id: row.seats.id, name: row.seats.name, status: row.seats.status },
      };
    }
    case "table":
      return { ...common, type: "table" };
    case "wall":
      return { ...common, type: "wall" };
  }
}
