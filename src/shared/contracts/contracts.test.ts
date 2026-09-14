import { describe, expect, it } from "vitest";
import { createReservationSchema, availabilityQuerySchema } from "./reservation";
import { createRoomSchema, saveLayoutSchema, spaceObjectInputSchema } from "./room";

// 계약 스키마는 서버 검증과 클라이언트 폼 검증 양쪽에서 쓰이므로 경계값을 여기서 고정한다.
const uuid = "aaaaaaaa-0000-4000-8000-000000000001";
const base = { id: uuid, x: 0, y: 0, width: 40, height: 40, rotation: 0, zIndex: 0 };

describe("room 계약", () => {
  it("seat 오브젝트는 seat 정보(id, name, status)가 없으면 거부한다", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "seat" }).success).toBe(false);
    expect(
      spaceObjectInputSchema.safeParse({
        ...base,
        type: "seat",
        seat: { id: uuid, name: "A1", status: "available" },
      }).success,
    ).toBe(true);
  });

  it("table/wall 은 공통 필드만으로 통과하고, 정의되지 않은 type 은 거부한다", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "table" }).success).toBe(true);
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall" }).success).toBe(true);
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "plant" }).success).toBe(false);
  });

  it("rotation 은 0/90/180/270 만 허용한다 (에디터가 90° 단위 회전만 지원)", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall", rotation: 45 }).success).toBe(
      false,
    );
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall", rotation: 270 }).success).toBe(
      true,
    );
  });

  it("saveLayoutSchema 는 음수 version 과 0 이하 크기를 거부한다", () => {
    expect(saveLayoutSchema.safeParse({ expectedVersion: -1, objects: [] }).success).toBe(false);
    expect(
      saveLayoutSchema.safeParse({
        expectedVersion: 0,
        objects: [{ ...base, type: "wall", width: 0 }],
      }).success,
    ).toBe(false);
    expect(saveLayoutSchema.safeParse({ expectedVersion: 3, objects: [] }).success).toBe(true);
  });

  it("createRoomSchema 는 DB 제약(200~10000, 정수)과 같고 description 기본값은 빈 문자열이다", () => {
    const parsed = createRoomSchema.parse({ name: " Room ", width: 800, height: 600 });
    expect(parsed).toEqual({ name: "Room", description: "", width: 800, height: 600 });
    expect(createRoomSchema.safeParse({ name: "R", width: 199, height: 600 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", width: 800.5, height: 600 }).success).toBe(false);
  });
});

describe("reservation 계약", () => {
  const startAt = "2026-09-15T09:00:00+09:00";
  const endAt = "2026-09-15T10:00:00+09:00";

  it("시작 시각이 종료 시각과 같거나 늦으면 거부한다", () => {
    expect(
      createReservationSchema.safeParse({ seatId: uuid, startAt: endAt, endAt: startAt }).success,
    ).toBe(false);
    expect(
      createReservationSchema.safeParse({ seatId: uuid, startAt, endAt: startAt }).success,
    ).toBe(false);
    expect(createReservationSchema.safeParse({ seatId: uuid, startAt, endAt }).success).toBe(true);
  });

  it("ISO 문자열에 타임존 오프셋이 없으면 거부한다 (서버 UTC / 클라이언트 KST 혼동 방지)", () => {
    expect(
      availabilityQuerySchema.safeParse({ startAt: "2026-09-15T09:00:00", endAt }).success,
    ).toBe(false);
    expect(availabilityQuerySchema.safeParse({ startAt, endAt }).success).toBe(true);
  });
});
