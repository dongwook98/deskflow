import { describe, expect, it } from "vitest";
import { ApiHttpError, mapPostgresError } from "./errors";

describe("mapPostgresError", () => {
  it("23P01(exclusion_violation) 은 409 reservation_overlap 으로 매핑한다", () => {
    const e = mapPostgresError({ code: "23P01", message: "conflicting key value" });
    expect(e).toBeInstanceOf(ApiHttpError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("reservation_overlap");
  });

  it("23503(foreign_key_violation) 은 409 seat_has_reservations 로 매핑한다", () => {
    expect(mapPostgresError({ code: "23503", message: "fk" }).code).toBe("seat_has_reservations");
  });

  it("P0001 이고 메시지가 version_conflict 면 409 version_conflict 로 매핑한다", () => {
    const e = mapPostgresError({ code: "P0001", message: "version_conflict" });
    expect(e.status).toBe(409);
    expect(e.code).toBe("version_conflict");
  });

  it("P0001 이지만 다른 메시지면 500 internal 이다 (알 수 없는 raise exception)", () => {
    expect(mapPostgresError({ code: "P0001", message: "something else" }).status).toBe(500);
  });

  it("P0002 와 PGRST116(0행) 은 404 not_found 로 매핑한다", () => {
    expect(mapPostgresError({ code: "P0002", message: "room_not_found" }).status).toBe(404);
    expect(mapPostgresError({ code: "PGRST116", message: "0 rows" }).status).toBe(404);
  });

  it("42501(RLS 거부) 은 403 forbidden 으로 매핑한다", () => {
    expect(mapPostgresError({ code: "42501", message: "rls" }).code).toBe("forbidden");
  });

  it("모르는 코드는 500 internal 로 감싼다", () => {
    const e = mapPostgresError({ code: "XX000", message: "boom" });
    expect(e.status).toBe(500);
    expect(e.code).toBe("internal");
  });
});
