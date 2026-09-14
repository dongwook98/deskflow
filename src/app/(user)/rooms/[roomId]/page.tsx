import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function RoomDetailPage({ params }: Props) {
  const { roomId } = await params;
  const queryClient = getQueryClient();
  // fetchQuery: prefetch 와 달리 값을 돌려주고 실패를 던진다 → 404 를 notFound() 로 연결
  const room = await queryClient
    .fetchQuery(roomQueries.detail(roomId, await serverFetchContext()))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="text-xl font-semibold">{room.name}</h1>
      <p className="mt-1 text-sm text-zinc-600">{room.description || "설명 없음"}</p>
      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        배치도와 예약은 다음 단계(Plan B, C)에서 구현됩니다. 캔버스 {room.width} × {room.height}
      </div>
    </HydrationBoundary>
  );
}
