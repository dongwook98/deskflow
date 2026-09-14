import { queryOptions } from "@tanstack/react-query";
import { apiFetch, type ServerFetchContext } from "@/shared/api";
import type { RoomDto } from "@/shared/contracts";
import { roomKeys } from "../model/query-keys";

/** ctx 는 RSC prefetch 에서만. 클라이언트는 인자 없이 호출해 같은 키로 캐시를 읽는다. */
export const roomQueries = {
  list: (ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: roomKeys.list(),
      queryFn: () => apiFetch<RoomDto[]>("/api/rooms", undefined, ctx),
    }),
  detail: (roomId: string, ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: roomKeys.detail(roomId),
      queryFn: () => apiFetch<RoomDto>(`/api/rooms/${roomId}`, undefined, ctx),
    }),
};
