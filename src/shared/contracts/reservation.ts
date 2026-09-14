import { z } from "zod";

export const RESERVATION_STATUSES = ["reserved", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** 좌석·룸·사용자 이름을 포함한 조회용 DTO (reservation_details 뷰) */
export interface ReservationDto {
  id: string;
  userId: string;
  userName: string;
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

/** 뷰어가 좌석 색을 정할 때 쓰는 상태. disabled 는 좌석 속성, 나머지는 시간 범위에 따른 결과 */
export const SEAT_AVAILABILITY = ["available", "reserved", "mine", "disabled"] as const;
export type SeatAvailability = (typeof SEAT_AVAILABILITY)[number];

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

/** GET /api/admin/reservations?roomId&date  (date = YYYY-MM-DD, Asia/Seoul 기준 하루) */
export const adminReservationsQuerySchema = z.object({
  roomId: z.uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
    .optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AdminReservationsQuery = z.infer<typeof adminReservationsQuerySchema>;
