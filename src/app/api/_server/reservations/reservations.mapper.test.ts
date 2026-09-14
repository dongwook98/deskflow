import { describe, expect, it } from "vitest";
import { toReservationDto } from "./reservations.mapper";

describe("toReservationDto", () => {
  it("뷰 행을 camelCase DTO 로 바꾼다", () => {
    expect(
      toReservationDto({
        id: "rv1",
        user_id: "u1",
        user_name: "테스터",
        seat_id: "s1",
        seat_name: "A1",
        room_id: "r1",
        room_name: "1층",
        start_at: "2026-09-15T00:00:00+00:00",
        end_at: "2026-09-15T01:00:00+00:00",
        status: "reserved",
        created_at: "2026-09-14T00:00:00+00:00",
        cancelled_at: null,
      }),
    ).toEqual({
      id: "rv1",
      userId: "u1",
      userName: "테스터",
      seatId: "s1",
      seatName: "A1",
      roomId: "r1",
      roomName: "1층",
      startAt: "2026-09-15T00:00:00+00:00",
      endAt: "2026-09-15T01:00:00+00:00",
      status: "reserved",
      createdAt: "2026-09-14T00:00:00+00:00",
      cancelledAt: null,
    });
  });

  it("조인 컬럼이 null 이면(뷰 타입상 가능) 명확한 에러를 던진다", () => {
    expect(() =>
      toReservationDto({
        id: "rv1",
        user_id: "u1",
        user_name: null,
        seat_id: "s1",
        seat_name: "A1",
        room_id: "r1",
        room_name: "1층",
        start_at: "x",
        end_at: "y",
        status: "reserved",
        created_at: "z",
        cancelled_at: null,
      }),
    ).toThrow(/user_name/);
  });
});
