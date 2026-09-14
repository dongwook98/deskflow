import { describe, expect, it } from "vitest";
import {
  addSlots,
  buildTimeSlots,
  formatKst,
  nextSlotAfter,
  toKstIso,
  todayKst,
} from "./time-slots";

describe("time-slots", () => {
  it("buildTimeSlots 는 09:00 부터 22:00 까지 30분 간격 27개", () => {
    const slots = buildTimeSlots();
    expect(slots[0]).toBe("09:00");
    expect(slots[1]).toBe("09:30");
    expect(slots[slots.length - 1]).toBe("22:00");
    expect(slots).toHaveLength(27);
  });

  it("toKstIso 는 +09:00 오프셋이 붙은 ISO 문자열을 만든다 (서버 UTC 와 무관)", () => {
    expect(toKstIso("2026-09-15", "09:00")).toBe("2026-09-15T09:00:00+09:00");
    expect(new Date(toKstIso("2026-09-15", "09:00")).toISOString()).toBe(
      "2026-09-15T00:00:00.000Z",
    );
  });

  it("todayKst 는 UTC 자정 직전에도 한국 날짜를 준다", () => {
    // UTC 2026-09-14 16:30 = KST 2026-09-15 01:30
    expect(todayKst(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  });

  it("nextSlotAfter 는 현재 시각 이후 첫 30분 경계를 주고, 영업 종료 후면 다음날 09:00", () => {
    // KST 10:10 → 10:30
    expect(nextSlotAfter(new Date("2026-09-15T01:10:00Z"))).toEqual({
      date: "2026-09-15",
      time: "10:30",
    });
    // KST 10:30 정각 → 11:00 (같은 슬롯은 이미 시작됨)
    expect(nextSlotAfter(new Date("2026-09-15T01:30:00Z"))).toEqual({
      date: "2026-09-15",
      time: "11:00",
    });
    // KST 22:10 → 다음날 09:00
    expect(nextSlotAfter(new Date("2026-09-15T13:10:00Z"))).toEqual({
      date: "2026-09-16",
      time: "09:00",
    });
    // KST 06:00 → 당일 09:00
    expect(nextSlotAfter(new Date("2026-09-14T21:00:00Z"))).toEqual({
      date: "2026-09-15",
      time: "09:00",
    });
  });

  it("addSlots 는 30분 단위로 더하고 영업 종료(22:00)를 넘으면 null", () => {
    expect(addSlots("09:00", 2)).toBe("10:00");
    expect(addSlots("21:30", 1)).toBe("22:00");
    expect(addSlots("21:30", 2)).toBeNull();
  });

  it("formatKst 는 한국 시간으로 'M/D (요일) HH:mm'", () => {
    expect(formatKst("2026-09-15T09:00:00+09:00")).toBe("9/15 (화) 09:00");
    expect(formatKst("2026-09-14T16:30:00Z")).toBe("9/15 (화) 01:30");
  });
});
