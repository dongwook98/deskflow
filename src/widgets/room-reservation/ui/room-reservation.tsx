"use client";

import { useMemo, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { SeatAvailability, SeatObjectDto } from "@/shared/contracts";
import { RoomMap, roomQueries } from "@/entities/room";
import {
  ReservePanel,
  TimeRangePicker,
  defaultTimeRange,
  toIsoRange,
  type TimeRange,
} from "@/features/reservation-create";

/**
 * PRD 12.1 + 부록 순서: 시간 선택 → 가용성 조회 → 배치도에 상태 표시 → 좌석 선택 → 예약.
 * room/layout 은 페이지가 prefetch. 가용성은 시간이 바뀔 때마다 새 키로 조회(15초 stale).
 */
export function RoomReservation({ roomId }: { roomId: string }) {
  const { data: room } = useSuspenseQuery(roomQueries.detail(roomId));
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  const [range, setRange] = useState<TimeRange>(() => defaultTimeRange());
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  /** 마지막 예약 성공 안내. 시간을 바꾸면 지운다 */
  const [notice, setNotice] = useState<string | null>(null);

  const iso = toIsoRange(range);
  const availability = useQuery({
    ...roomQueries.availability(roomId, iso?.startAt ?? "", iso?.endAt ?? ""),
    enabled: iso !== null,
  });

  const seats = useMemo(
    () => layout.objects.filter((o): o is SeatObjectDto => o.type === "seat"),
    [layout.objects],
  );
  const occupied = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const o of availability.data?.occupied ?? []) map.set(o.seatId, o.mine);
    return map;
  }, [availability.data]);

  const seatStatusOf = (seatId: string): SeatAvailability => {
    const seat = seats.find((s) => s.seat.id === seatId);
    if (!seat || seat.seat.status === "disabled") return "disabled";
    const mine = occupied.get(seatId);
    if (mine === undefined) return "available";
    return mine ? "mine" : "reserved";
  };

  const selectedSeat = seats.find((s) => s.seat.id === selectedSeatId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">{room.description || "설명 없음"}</p>
      </div>

      <TimeRangePicker
        value={range}
        onChange={(next) => {
          setRange(next);
          setSelectedSeatId(null); // 시간이 바뀌면 이전 선택은 무효
          setNotice(null);
        }}
      />

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <RoomMap
            layout={layout}
            seatStatusOf={seatStatusOf}
            selectedSeatId={selectedSeatId}
            onSelectSeat={setSelectedSeatId}
          />
          {availability.isFetching ? (
            <span className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-xs text-zinc-500">
              가용성 확인 중...
            </span>
          ) : null}
        </div>
        <ReservePanel
          roomId={roomId}
          seat={selectedSeat}
          range={range}
          onReserved={(seat) => {
            setSelectedSeatId(null);
            setNotice(`${seat.seat.name} 좌석을 예약했습니다. 내 예약에서 확인할 수 있습니다.`);
          }}
        />
      </div>
    </div>
  );
}
