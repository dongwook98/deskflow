"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/shared/api";
import type { CreateRoomInput, RoomDto, UpdateRoomInput } from "@/shared/contracts";
import { roomKeys } from "@/entities/room";

export function useCreateRoom() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: CreateRoomInput) =>
      apiFetch<RoomDto>("/api/rooms", { method: "POST", body: input }),
    onSuccess: async (room) => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.all });
      router.replace(`/admin/rooms/${room.id}`);
    },
  });
}

export function useUpdateRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoomInput) =>
      apiFetch<RoomDto>(`/api/rooms/${roomId}`, { method: "PATCH", body: input }),
    onSuccess: (room) => {
      // 상세는 응답으로 즉시 갱신, 목록은 다음 조회 때 다시 받는다
      queryClient.setQueryData(roomKeys.detail(roomId), room);
      return queryClient.invalidateQueries({ queryKey: roomKeys.list() });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (roomId: string) => apiFetch<void>(`/api/rooms/${roomId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.all });
      router.replace("/admin/rooms");
    },
  });
}
