"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ReservationCard, reservationQueries } from "@/entities/reservation";
import { CancelReservationButton } from "@/features/reservation-cancel";

/** 다가오는 예약(reserved, 시작 전) 과 지난/취소 예약을 나눠 보여준다 */
export function MyReservations() {
  const { data } = useSuspenseQuery(reservationQueries.mine());
  // 렌더 순수성: 기준 시각은 마운트 시 한 번만
  const [now] = useState(() => Date.now());
  const upcoming = data.filter(
    (r) => r.status === "reserved" && new Date(r.startAt).getTime() > now,
  );
  const past = data.filter((r) => !upcoming.includes(r));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold">다가오는 예약</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-600">예정된 예약이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...upcoming].reverse().map((r) => (
              <li key={r.id}>
                <ReservationCard
                  reservation={r}
                  actions={<CancelReservationButton reservation={r} />}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-600">지난 · 취소된 예약</h2>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-500">없음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((r) => (
              <li key={r.id}>
                <ReservationCard reservation={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
