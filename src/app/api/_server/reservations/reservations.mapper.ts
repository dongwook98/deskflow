import type { ReservationDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

/** 뷰 컬럼은 전부 nullable 로 생성된다(뷰 타입 추론 한계). 조인 조건상 실제로는 null 이 없다. */
type Row = Tables<"reservation_details">;

function req<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`reservation_details.${name} 이 null 입니다.`);
  return value;
}

export function toReservationDto(row: Row): ReservationDto {
  return {
    id: req(row.id, "id"),
    userId: req(row.user_id, "user_id"),
    userName: req(row.user_name, "user_name"),
    seatId: req(row.seat_id, "seat_id"),
    seatName: req(row.seat_name, "seat_name"),
    roomId: req(row.room_id, "room_id"),
    roomName: req(row.room_name, "room_name"),
    startAt: req(row.start_at, "start_at"),
    endAt: req(row.end_at, "end_at"),
    status: req(row.status, "status"),
    createdAt: req(row.created_at, "created_at"),
    cancelledAt: row.cancelled_at,
  };
}
