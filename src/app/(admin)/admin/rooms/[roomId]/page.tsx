import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { DeleteRoomButton, RoomForm } from "@/features/room-manage";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function AdminRoomPage({ params }: Props) {
  const { roomId } = await params;
  const queryClient = getQueryClient();
  const room = await queryClient
    .fetchQuery(roomQueries.detail(roomId, await serverFetchContext()))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/rooms/${room.id}/editor`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-100"
          >
            에디터 열기
          </Link>
          <DeleteRoomButton roomId={room.id} roomName={room.name} />
        </div>
      </div>
      <RoomForm mode="edit" room={room} />
    </HydrationBoundary>
  );
}
