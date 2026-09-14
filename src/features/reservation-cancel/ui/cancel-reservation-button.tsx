"use client";

import { useState } from "react";
import type { ReservationDto } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { useCancelReservation } from "../api/mutations";

/** 시작 전 reserved 예약만 취소 버튼을 보여준다 */
export function CancelReservationButton({ reservation }: { reservation: ReservationDto }) {
  const cancel = useCancelReservation();
  // 렌더 중 Date.now() 는 순수하지 않으므로(react-hooks/purity) 마운트 시각을 한 번만 고정한다
  const [now] = useState(() => Date.now());
  const cancellable =
    reservation.status === "reserved" && new Date(reservation.startAt).getTime() > now;
  if (!cancellable) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={cancel.isPending}
      onClick={() => {
        if (window.confirm("이 예약을 취소할까요?")) cancel.mutate(reservation.id);
      }}
    >
      {cancel.isPending ? "취소 중..." : "취소"}
    </Button>
  );
}
