import { describe, expect, it } from "vitest";
import { toRoomDto } from "./rooms.mapper";

describe("toRoomDto", () => {
  it("DB 행(snake_case)을 RoomDto(camelCase)로 바꾸고 created_by 는 노출하지 않는다", () => {
    expect(
      toRoomDto({
        id: "r1",
        name: "Room",
        description: "",
        width: 800,
        height: 600,
        layout_version: 2,
        created_by: "u1",
        created_at: "2026-09-14T00:00:00+00:00",
        updated_at: "2026-09-14T01:00:00+00:00",
      }),
    ).toEqual({
      id: "r1",
      name: "Room",
      description: "",
      width: 800,
      height: 600,
      layoutVersion: 2,
      createdAt: "2026-09-14T00:00:00+00:00",
      updatedAt: "2026-09-14T01:00:00+00:00",
    });
  });
});
