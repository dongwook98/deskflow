"use client";

import { useMemo } from "react";
import { addSlots, buildTimeSlots, nextSlotAfter, todayKst, toKstIso } from "@/entities/reservation";
import { Field, Input } from "@/shared/ui";

export interface TimeRange {
  date: string; // YYYY-MM-DD (KST)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** 기본값: 지금 이후 첫 슬롯부터 1시간 */
export function defaultTimeRange(now = new Date()): TimeRange {
  const next = nextSlotAfter(now);
  return { date: next.date, startTime: next.time, endTime: addSlots(next.time, 2) ?? "22:00" };
}

/** 선택값을 API 가 받는 ISO 범위로. 시작 ≥ 종료면 null */
export function toIsoRange(range: TimeRange): { startAt: string; endAt: string } | null {
  if (range.startTime >= range.endTime) return null;
  return {
    startAt: toKstIso(range.date, range.startTime),
    endAt: toKstIso(range.date, range.endTime),
  };
}

interface Props {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}

/**
 * 날짜 + 시작/종료 30분 슬롯 (PRD 부록: 날짜/시간을 먼저 고른다). 오늘~14일 후까지.
 * 종료 목록은 시작 이후 슬롯만. 시작을 바꿔 종료가 무효해지면 +1시간으로 맞춘다.
 */
export function TimeRangePicker({ value, onChange }: Props) {
  const slots = useMemo(() => buildTimeSlots(), []);
  const startOptions = slots.slice(0, -1); // 22:00 은 시작 불가
  const endOptions = slots.filter((s) => s > value.startTime);
  const min = todayKst();
  const max = useMemo(() => {
    const d = new Date(`${min}T00:00:00+09:00`);
    d.setDate(d.getDate() + 14);
    return todayKst(d);
  }, [min]);

  const selectClass = "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="날짜" htmlFor="res-date">
        <Input
          id="res-date"
          type="date"
          min={min}
          max={max}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </Field>
      <Field label="시작" htmlFor="res-start">
        <select
          id="res-start"
          className={selectClass}
          value={value.startTime}
          onChange={(e) => {
            const startTime = e.target.value;
            const endTime =
              value.endTime > startTime ? value.endTime : (addSlots(startTime, 2) ?? "22:00");
            onChange({ ...value, startTime, endTime });
          }}
        >
          {startOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="종료" htmlFor="res-end">
        <select
          id="res-end"
          className={selectClass}
          value={value.endTime}
          onChange={(e) => onChange({ ...value, endTime: e.target.value })}
        >
          {endOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
