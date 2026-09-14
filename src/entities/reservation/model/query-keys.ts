import type { AdminReservationsQuery } from "@/shared/contracts";

export const reservationKeys = {
  all: ["reservations"] as const,
  mine: () => [...reservationKeys.all, "mine"] as const,
  admin: (query: AdminReservationsQuery) => [...reservationKeys.all, "admin", query] as const,
};
