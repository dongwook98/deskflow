"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { ReservationDto } from "@/shared/contracts";
import { reservationKeys } from "@/entities/reservation";
import { roomKeys } from "@/entities/room";

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reservationId: string) =>
      apiFetch<ReservationDto>(`/api/reservations/${reservationId}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      // 취소된 좌석이 다시 비었으므로 가용성 전부 무효화
      await queryClient.invalidateQueries({ queryKey: [...roomKeys.all, "availability"] });
    },
  });
}
