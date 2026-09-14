"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { CreateReservationInput, ReservationDto } from "@/shared/contracts";
import { reservationKeys } from "@/entities/reservation";
import { roomKeys } from "@/entities/room";

/**
 * 예약 생성. 성공·실패 모두 가용성을 다시 받는다 — 409 면 방금 다른 사람이 잡은 것이므로
 * 배치도를 즉시 갱신해 사용자가 다른 좌석을 고르게 한다.
 * 무효화 키 ["rooms","availability",roomId] 는 그 room 의 모든 시간 범위 가용성에 매칭된다.
 */
export function useCreateReservation(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiFetch<ReservationDto>("/api/reservations", { method: "POST", body: input }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [...roomKeys.all, "availability", roomId] });
      await queryClient.invalidateQueries({ queryKey: reservationKeys.mine() });
    },
  });
}
