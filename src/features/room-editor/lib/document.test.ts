import { describe, expect, it } from "vitest";
import type { LayoutDto, SpaceObjectDto } from "@/shared/contracts";
import {
  createObject,
  fromLayoutDto,
  insertObject,
  nextSeatName,
  orderedObjects,
  patchObject,
  removeObject,
  toSaveInput,
} from "./document";

const seat = (id: string, zIndex: number, name = id): SpaceObjectDto => ({
  id,
  roomId: "r",
  type: "seat",
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  rotation: 0,
  zIndex,
  seat: { id: `seat-${id}`, name, status: "available" },
});

const table = (id: string, zIndex: number): SpaceObjectDto => ({
  id,
  roomId: "r",
  type: "table",
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  rotation: 0,
  zIndex,
});

const layout: LayoutDto = {
  roomId: "r",
  width: 1000,
  height: 800,
  layoutVersion: 3,
  objects: [seat("b", 2, "S2"), seat("a", 1, "S1"), table("c", 5)],
};

describe("fromLayoutDto / toSaveInput", () => {
  it("zIndex 순으로 order 를 만든다", () => {
    expect(fromLayoutDto(layout).order).toEqual(["a", "b", "c"]);
  });

  it("toSaveInput 은 order 인덱스를 zIndex 로 쓰고 roomId 를 제거한다", () => {
    const input = toSaveInput(fromLayoutDto(layout), 3);
    expect(input.expectedVersion).toBe(3);
    expect(input.objects.map((o) => [o.id, o.zIndex])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect("roomId" in input.objects[0]!).toBe(false);
    const first = input.objects[0]!;
    expect(first.type === "seat" && first.seat.name).toBe("S1");
  });
});

describe("insert / remove / patch", () => {
  it("insertObject 는 맨 위(order 끝)에 추가한다", () => {
    const d = insertObject(fromLayoutDto(layout), table("d", 0));
    expect(d.order).toEqual(["a", "b", "c", "d"]);
    expect(orderedObjects(d).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("removeObject 는 objects 와 order 양쪽에서 제거하고 없는 id 면 같은 참조", () => {
    const base = fromLayoutDto(layout);
    const d = removeObject(base, "b");
    expect(d.order).toEqual(["a", "c"]);
    expect(d.objects["b"]).toBeUndefined();
    expect(removeObject(base, "nope")).toBe(base);
  });

  it("patchObject 는 위치·크기·회전을 바꾸고 새 참조를 만든다", () => {
    const base = fromLayoutDto(layout);
    const d = patchObject(base, "a", { x: 50, rotation: 90 });
    expect(d).not.toBe(base);
    expect(d.objects["a"]).toMatchObject({ x: 50, rotation: 90 });
    expect(base.objects["a"]?.x).toBe(0); // 원본 불변
  });

  it("patchObject 의 seatName/seatStatus 는 seat 에만 적용되고 table 에는 무시된다", () => {
    const base = fromLayoutDto(layout);
    const d = patchObject(base, "a", { seatName: "VIP", seatStatus: "disabled" });
    const a = d.objects["a"];
    expect(a?.type === "seat" && a.seat).toEqual({ id: "seat-a", name: "VIP", status: "disabled" });
    expect(patchObject(base, "c", { seatName: "X" })).toBe(base);
  });
});

describe("createObject / nextSeatName", () => {
  it("createObject 는 중심 좌표를 좌상단으로 바꾸고 seat 는 이름과 새 seat.id 를 가진다", () => {
    const o = createObject({
      type: "seat",
      roomId: "r",
      center: { x: 100, y: 100 },
      zIndex: 0,
      seatName: "S9",
    });
    expect(o).toMatchObject({ type: "seat", x: 80, y: 80, width: 40, height: 40, rotation: 0 });
    expect(o.type === "seat" && o.seat.name).toBe("S9");
    expect(o.type === "seat" && o.seat.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nextSeatName 은 기존 좌석 수 + 1 을 쓰되 이미 있는 이름은 건너뛴다", () => {
    const d = fromLayoutDto(layout); // S1, S2 존재
    expect(nextSeatName(d)).toBe("S3");
    const d2 = insertObject(d, seat("z", 9, "S3"));
    expect(nextSeatName(d2)).toBe("S4");
  });
});
