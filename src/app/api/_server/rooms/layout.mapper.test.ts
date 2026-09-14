import { describe, expect, it } from "vitest";
import { toRotation, toSpaceObjectDto } from "./layout.mapper";

const base = {
  id: "o1",
  room_id: "r1",
  x: 10,
  y: 20,
  width: 40,
  height: 40,
  rotation: 90,
  z_index: 3,
  created_at: "2026-09-15T00:00:00+00:00",
  updated_at: "2026-09-15T00:00:00+00:00",
};

describe("toSpaceObjectDto", () => {
  it("seat 행은 seats 조인 결과를 seat 필드로 붙인다", () => {
    const dto = toSpaceObjectDto({
      ...base,
      type: "seat",
      seats: { id: "s1", space_object_id: "o1", name: "A1", status: "disabled" },
    });
    expect(dto).toEqual({
      id: "o1",
      roomId: "r1",
      type: "seat",
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      rotation: 90,
      zIndex: 3,
      seat: { id: "s1", name: "A1", status: "disabled" },
    });
  });

  it("table/wall 행은 seat 필드가 없다", () => {
    const dto = toSpaceObjectDto({ ...base, type: "table", seats: null });
    expect(dto.type).toBe("table");
    expect("seat" in dto).toBe(false);
  });

  it("seat 타입인데 seats 행이 없으면(데이터 불일치) 던진다", () => {
    expect(() => toSpaceObjectDto({ ...base, type: "seat", seats: null })).toThrow(/seat/);
  });
});

describe("toRotation", () => {
  it("0/90/180/270 은 그대로, 그 외 값은 가장 가까운 90° 단위로 정규화한다", () => {
    expect(toRotation(270)).toBe(270);
    expect(toRotation(89)).toBe(90);
    expect(toRotation(-90)).toBe(270);
    expect(toRotation(360)).toBe(0);
  });
});
