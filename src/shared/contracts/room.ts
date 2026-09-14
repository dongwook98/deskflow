import { z } from "zod";

// 숫자 제약은 supabase/migrations/0001_init.sql 과 일치시킨다.

export const OBJECT_TYPES = ["seat", "table", "wall"] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const SEAT_STATUSES = ["available", "disabled"] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

// ---------------------------------------------------------------------------
// DTO (응답)
// ---------------------------------------------------------------------------

export interface RoomDto {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  layoutVersion: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** 캔버스 단위 좌표. x, y 는 좌상단. rotation 은 오브젝트 중심 기준 시계 방향(도). */
interface SpaceObjectBaseDto {
  id: string;
  roomId: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
  zIndex: number;
}

export interface SeatInfoDto {
  id: string;
  name: string;
  status: SeatStatus;
}

export interface SeatObjectDto extends SpaceObjectBaseDto {
  type: "seat";
  seat: SeatInfoDto;
}
export interface TableObjectDto extends SpaceObjectBaseDto {
  type: "table";
}
export interface WallObjectDto extends SpaceObjectBaseDto {
  type: "wall";
}

export type SpaceObjectDto = SeatObjectDto | TableObjectDto | WallObjectDto;

export function isSeatObject(o: SpaceObjectDto): o is SeatObjectDto {
  return o.type === "seat";
}

/** GET /api/rooms/:id/layout */
export interface LayoutDto {
  roomId: string;
  width: number;
  height: number;
  layoutVersion: number;
  objects: SpaceObjectDto[];
}

// ---------------------------------------------------------------------------
// 입력 스키마 (요청)
// ---------------------------------------------------------------------------

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  width: z.number().int().min(200).max(10000),
  height: z.number().int().min(200).max(10000),
});

export const updateRoomSchema = createRoomSchema.partial();

const spaceObjectBaseInput = z.object({
  id: z.uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  zIndex: z.number().int().nonnegative(),
});

export const seatInfoInputSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(50),
  status: z.enum(SEAT_STATUSES),
});

export const spaceObjectInputSchema = z.discriminatedUnion("type", [
  spaceObjectBaseInput.extend({ type: z.literal("seat"), seat: seatInfoInputSchema }),
  spaceObjectBaseInput.extend({ type: z.literal("table") }),
  spaceObjectBaseInput.extend({ type: z.literal("wall") }),
]);

/** PUT /api/rooms/:id/layout body */
export const saveLayoutSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  objects: z.array(spaceObjectInputSchema).max(2000),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type SpaceObjectInput = z.infer<typeof spaceObjectInputSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;

/** PUT /api/rooms/:id/layout 응답 */
export interface SaveLayoutResultDto {
  layoutVersion: number;
}
