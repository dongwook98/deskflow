import { z } from "zod";

export const RESERVATION_STATUSES = ["reserved", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** 좌석·룸 이름을 포함한 조회용 DTO */
export interface ReservationDto {
  id: string;
  seatId: string;
  seatName: string;
  roomId: string;
  roomName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
}

/** GET /api/rooms/:id/availability */
export interface AvailabilityDto {
  occupied: { seatId: string; mine: boolean }[];
}

const isoDatetime = z.iso.datetime({ offset: true });

const timeRange = {
  startAt: isoDatetime,
  endAt: isoDatetime,
};

const startBeforeEnd = (v: { startAt: string; endAt: string }) =>
  new Date(v.startAt).getTime() < new Date(v.endAt).getTime();

const START_BEFORE_END = { message: "종료 시각은 시작 시각보다 늦어야 합니다.", path: ["endAt"] };

/** POST /api/reservations body */
export const createReservationSchema = z
  .object({ seatId: z.uuid(), ...timeRange })
  .refine(startBeforeEnd, START_BEFORE_END);

/** GET /api/rooms/:id/availability?startAt&endAt */
export const availabilityQuerySchema = z.object(timeRange).refine(startBeforeEnd, START_BEFORE_END);

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
