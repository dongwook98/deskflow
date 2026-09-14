import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { reservationQueries } from "@/entities/reservation";
import { MyReservations } from "@/widgets/my-reservations";

export default async function MyReservationsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(reservationQueries.mine(await serverFetchContext()));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="mb-4 text-xl font-semibold">내 예약</h1>
      <MyReservations />
    </HydrationBoundary>
  );
}
