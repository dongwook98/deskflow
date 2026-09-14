import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomList } from "./room-list";

/** 서버 prefetch(대안 B: /api 호출) → dehydrate → 클라이언트 RoomList 가 캐시에서 읽음 */
export default async function RoomsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(roomQueries.list(await serverFetchContext()));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="mb-4 text-xl font-semibold">공간</h1>
      <RoomList />
    </HydrationBoundary>
  );
}
