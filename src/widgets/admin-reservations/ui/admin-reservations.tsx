"use client";

import { useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Field, Input } from "@/shared/ui";
import { ReservationCard, reservationQueries, todayKst } from "@/entities/reservation";
import { roomQueries } from "@/entities/room";
import { CancelReservationButton } from "@/features/reservation-cancel";

/** 관리자 현황: 공간·날짜 필터. 취소 버튼은 admin RLS 로 남의 예약도 취소 가능 */
export function AdminReservations() {
  const { data: rooms } = useSuspenseQuery(roomQueries.list());
  const [roomId, setRoomId] = useState<string>("");
  const [date, setDate] = useState<string>(() => todayKst());
  const query = { roomId: roomId || undefined, date: date || undefined };
  const { data, isFetching } = useQuery(reservationQueries.admin(query));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="공간" htmlFor="adm-room">
          <select
            id="adm-room"
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">전체</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="날짜" htmlFor="adm-date">
          <Input id="adm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {isFetching ? <p className="text-xs text-zinc-500">불러오는 중...</p> : null}
      {data && data.length === 0 ? <p className="text-sm text-zinc-600">예약이 없습니다.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((r) => (
          <li key={r.id}>
            <ReservationCard
              reservation={r}
              showUser
              actions={<CancelReservationButton reservation={r} />}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
