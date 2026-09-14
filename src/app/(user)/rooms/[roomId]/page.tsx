import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomReservation } from "@/widgets/room-reservation";

interface Props {
  params: Promise<{ roomId: string }>;
}

/** 공간 상세 = 예약 화면. room + layout 을 prefetch, 가용성은 클라이언트가 시간 선택 후 조회 */
export default async function RoomDetailPage({ params }: Props) {
  const { roomId } = await params;
  const queryClient = getQueryClient();
  const ctx = await serverFetchContext();
  await Promise.all([
    queryClient.fetchQuery(roomQueries.detail(roomId, ctx)),
    queryClient.fetchQuery(roomQueries.layout(roomId, ctx)),
  ]).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RoomReservation roomId={roomId} />
    </HydrationBoundary>
  );
}
