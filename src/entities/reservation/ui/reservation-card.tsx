import type { ReactNode } from "react";
import type { ReservationDto } from "@/shared/contracts";
import { formatKst } from "../lib/time-slots";

interface Props {
  reservation: ReservationDto;
  /** 우측 액션 슬롯 (취소 버튼 등). features 가 주입한다 — entities 는 features 를 모른다 */
  actions?: ReactNode;
  showUser?: boolean;
}

export function ReservationCard({ reservation, actions, showUser = false }: Props) {
  const cancelled = reservation.status === "cancelled";
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border bg-white p-4 ${cancelled ? "border-zinc-200 opacity-60" : "border-zinc-300"}`}
    >
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-medium">
          {reservation.roomName} · {reservation.seatName}
        </span>
        <span className="text-zinc-600">
          {formatKst(reservation.startAt)} ~ {formatKst(reservation.endAt).slice(-5)}
        </span>
        {showUser ? <span className="text-zinc-500">{reservation.userName}</span> : null}
        {cancelled ? <span className="text-xs text-zinc-500">취소됨</span> : null}
      </div>
      {actions}
    </div>
  );
}
