import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import Link from "next/link";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { AdminRoomList } from "./admin-room-list";

export default async function AdminRoomsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(roomQueries.list(await serverFetchContext()));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">공간 관리</h1>
        <Link
          href="/admin/rooms/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          새 공간
        </Link>
      </div>
      <AdminRoomList />
    </HydrationBoundary>
  );
}
