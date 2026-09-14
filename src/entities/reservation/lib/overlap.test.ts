import { describe, expect, it } from "vitest";
import { overlaps } from "./overlap";

// PRD 12.2: newStart < existingEnd AND newEnd > existingStart. 구간은 [start, end)
describe("overlaps", () => {
  const a = ["2026-09-15T10:00:00+09:00", "2026-09-15T12:00:00+09:00"] as const;

  it("부분 겹침은 true", () => {
    expect(
      overlaps(a[0], a[1], "2026-09-15T11:00:00+09:00", "2026-09-15T13:00:00+09:00"),
    ).toBe(true);
  });

  it("끝과 시작이 맞닿으면(12:00~14:00) false — DB 의 '[)' 와 같은 규칙", () => {
    expect(
      overlaps(a[0], a[1], "2026-09-15T12:00:00+09:00", "2026-09-15T14:00:00+09:00"),
    ).toBe(false);
  });

  it("포함 관계는 true, 완전히 떨어지면 false", () => {
    expect(
      overlaps(a[0], a[1], "2026-09-15T10:30:00+09:00", "2026-09-15T11:00:00+09:00"),
    ).toBe(true);
    expect(
      overlaps(a[0], a[1], "2026-09-15T08:00:00+09:00", "2026-09-15T09:00:00+09:00"),
    ).toBe(false);
  });
});
