import { describe, expect, it } from "vitest";
import { createReservationSchema, availabilityQuerySchema } from "./reservation";
import { createRoomSchema, saveLayoutSchema, spaceObjectInputSchema } from "./room";

const uuid = "aaaaaaaa-0000-4000-8000-000000000001";
const base = { id: uuid, x: 0, y: 0, width: 40, height: 40, rotation: 0, zIndex: 0 };

describe("room contracts", () => {
  it("seat object requires seat info", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "seat" }).success).toBe(false);
    expect(
      spaceObjectInputSchema.safeParse({
        ...base,
        type: "seat",
        seat: { id: uuid, name: "A1", status: "available" },
      }).success,
    ).toBe(true);
  });

  it("table/wall must not carry seat info implicitly and accept base fields", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "table" }).success).toBe(true);
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall" }).success).toBe(true);
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "plant" }).success).toBe(false);
  });

  it("rotation limited to 0/90/180/270", () => {
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall", rotation: 45 }).success).toBe(
      false,
    );
    expect(spaceObjectInputSchema.safeParse({ ...base, type: "wall", rotation: 270 }).success).toBe(
      true,
    );
  });

  it("saveLayoutSchema rejects negative version and non-positive size", () => {
    expect(saveLayoutSchema.safeParse({ expectedVersion: -1, objects: [] }).success).toBe(false);
    expect(
      saveLayoutSchema.safeParse({
        expectedVersion: 0,
        objects: [{ ...base, type: "wall", width: 0 }],
      }).success,
    ).toBe(false);
    expect(saveLayoutSchema.safeParse({ expectedVersion: 3, objects: [] }).success).toBe(true);
  });

  it("createRoomSchema matches DB bounds and defaults description", () => {
    const parsed = createRoomSchema.parse({ name: " Room ", width: 800, height: 600 });
    expect(parsed).toEqual({ name: "Room", description: "", width: 800, height: 600 });
    expect(createRoomSchema.safeParse({ name: "R", width: 199, height: 600 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "R", width: 800.5, height: 600 }).success).toBe(false);
  });
});

describe("reservation contracts", () => {
  const startAt = "2026-09-15T09:00:00+09:00";
  const endAt = "2026-09-15T10:00:00+09:00";

  it("rejects start >= end", () => {
    expect(
      createReservationSchema.safeParse({ seatId: uuid, startAt: endAt, endAt: startAt }).success,
    ).toBe(false);
    expect(
      createReservationSchema.safeParse({ seatId: uuid, startAt, endAt: startAt }).success,
    ).toBe(false);
    expect(createReservationSchema.safeParse({ seatId: uuid, startAt, endAt }).success).toBe(true);
  });

  it("requires timezone offset in ISO strings", () => {
    expect(
      availabilityQuerySchema.safeParse({ startAt: "2026-09-15T09:00:00", endAt }).success,
    ).toBe(false);
    expect(availabilityQuerySchema.safeParse({ startAt, endAt }).success).toBe(true);
  });
});
