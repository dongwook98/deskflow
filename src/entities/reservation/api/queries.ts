import { queryOptions } from "@tanstack/react-query";
import { apiFetch, type ServerFetchContext } from "@/shared/api";
import type { AdminReservationsQuery, ReservationDto } from "@/shared/contracts";
import { reservationKeys } from "../model/query-keys";

function adminPath(query: AdminReservationsQuery): string {
  const params = new URLSearchParams();
  if (query.roomId) params.set("roomId", query.roomId);
  if (query.date) params.set("date", query.date);
  const qs = params.toString();
  return `/api/admin/reservations${qs ? `?${qs}` : ""}`;
}

export const reservationQueries = {
  mine: (ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: reservationKeys.mine(),
      queryFn: () => apiFetch<ReservationDto[]>("/api/reservations", undefined, ctx),
    }),
  admin: (query: AdminReservationsQuery, ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: reservationKeys.admin(query),
      queryFn: () => apiFetch<ReservationDto[]>(adminPath(query), undefined, ctx),
    }),
};
