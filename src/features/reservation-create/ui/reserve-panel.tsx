"use client";

import { ApiError } from "@/shared/api";
import type { SeatObjectDto } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { formatKst } from "@/entities/reservation";
import { useCreateReservation } from "../api/mutations";
import { toIsoRange, type TimeRange } from "./time-range-picker";

interface Props {
  roomId: string;
  seat: SeatObjectDto | null;
  range: TimeRange;
  /** 예약 성공. 위젯이 선택을 해제하고 성공 배너를 띄운다 (이 패널은 언마운트되므로 여기서 성공 문구를 보여줄 수 없다) */
  onReserved: (seat: SeatObjectDto) => void;
}

/** 선택한 좌석 + 시간 확인 → 예약 버튼. 409 는 "방금 예약됨" 안내 */
export function ReservePanel({ roomId, seat, range, onReserved }: Props) {
  const create = useCreateReservation(roomId);
  const iso = toIsoRange(range);

  if (!seat) {
    return (
      <p className="text-sm text-zinc-600">
        배치도에서 예약할 좌석을 선택하세요. 파랑 = 가능, 빨강 = 예약됨, 초록 = 내 예약, 회색 = 사용
        불가
      </p>
    );
  }

  const error =
    create.error instanceof ApiError
      ? create.error.code === "reservation_overlap"
        ? "방금 다른 사용자가 예약했습니다. 다른 좌석이나 시간을 선택하세요."
        : create.error.message
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white p-4">
      <div className="text-sm">
        <p className="font-medium">{seat.seat.name}</p>
        {iso ? (
          <p className="text-zinc-600">
            {formatKst(iso.startAt)} ~ {formatKst(iso.endAt).slice(-5)}
          </p>
        ) : (
          <p className="text-red-600">종료 시각은 시작보다 늦어야 합니다.</p>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button
        disabled={!iso || create.isPending}
        onClick={() => {
          if (!iso) return;
          create.mutate({ seatId: seat.seat.id, ...iso }, { onSuccess: () => onReserved(seat) });
        }}
      >
        {create.isPending ? "예약 중..." : "예약하기"}
      </Button>
    </div>
  );
}
