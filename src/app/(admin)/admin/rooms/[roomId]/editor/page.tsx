import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomEditorPage } from "./room-editor-page";

interface Props {
  params: Promise<{ roomId: string }>;
}

/** room 메타와 layout 을 서버에서 prefetch. 에디터(클라이언트)는 캐시에서 읽어 즉시 렌더. */
export default async function EditorPage({ params }: Props) {
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
      <RoomEditorPage roomId={roomId} />
    </HydrationBoundary>
  );
}
