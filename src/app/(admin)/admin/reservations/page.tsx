import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { AdminReservations } from "@/widgets/admin-reservations";

export default async function AdminReservationsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(roomQueries.list(await serverFetchContext()));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="mb-4 text-xl font-semibold">예약 현황</h1>
      <AdminReservations />
    </HydrationBoundary>
  );
}
