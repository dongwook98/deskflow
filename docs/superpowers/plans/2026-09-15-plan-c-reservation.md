# Plan C: 좌석 예약 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 `/rooms/:id` 에서 날짜·시간을 고르고 배치도에서 좌석 상태를 보며 예약하고, `/reservations` 에서 내 예약을 보고 취소한다. 관리자는 `/admin/reservations` 에서 전체 현황을 본다. 동시 예약은 DB exclusion constraint 가 막고 클라이언트는 409 를 받는다.

**Architecture:** 흐름은 PRD 부록 순서(날짜/시간 → 좌석). 가용성은 `get_seat_availability` RPC 로 점유 seat_id 만 받는다(남의 예약 행 비노출). 조회 DTO 는 `reservation_details` 뷰(`security_invoker`)로 한 번에 조인. 서버는 겹침을 미리 검사하지 않고 insert 후 `23P01 → 409` 로 매핑한다. 배치도는 에디터와 별개의 읽기 전용 SVG(`viewBox` 로 자동 fit, 모바일 우선).

**Tech Stack:** Plan A/B 와 동일. 추가 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md` 5절(get_seat_availability), 6절(reservations API), 8절(가용성 staleTime 15s), 10절(예약 흐름), 11절. `PRD.md` 12절 + 부록 「예약 세부 확정」. 결정 D-13, D-29, D-30, D-33, D-40.

## Global Constraints

- Plan A/B 의 Global Constraints 유지.
- 시간 단위 30분, 운영 09:00~22:00, 과거 불가. 타임존은 Asia/Seoul 고정(`+09:00`). 클라이언트가 ISO(오프셋 포함)를 만들고 서버는 그대로 저장(D-33).
- 일반 사용자는 남의 예약 행을 읽지 못한다. 가용성은 점유 seat_id + mine 만.
- 예약 겹침 검사는 DB 가 최종. 서버는 `23P01` 을 409 `reservation_overlap` 으로만 매핑.
- 취소는 soft(`status = cancelled`, `cancelled_at`). 취소된 예약은 exclusion 대상 아님(where 절).
- 새 스키마 변경은 새 마이그레이션 파일. `pnpm db:smoke` 통과 후 `supabase db push`, 타입 재생성.
- 각 Task 끝: `pnpm typecheck && pnpm lint && pnpm test` 통과 후 커밋.

---

## 파일 구조 (이 계획에서 생성/수정)

```
supabase/migrations/0002_reservation_details.sql
scripts/db-smoke.sh                                   (수정) 뷰 조회 확인 1줄
src/
  app/api/_server/db/database.types.ts                (재생성)
  app/api/_server/reservations/reservations.mapper.ts, reservations.mapper.test.ts
  app/api/_server/reservations/reservations.service.ts
  app/api/_server/reservations/availability.service.ts
  app/api/reservations/route.ts
  app/api/reservations/[reservationId]/cancel/route.ts
  app/api/rooms/[roomId]/availability/route.ts
  app/api/admin/reservations/route.ts
  shared/contracts/reservation.ts                     (수정) userName, adminReservationsQuerySchema, SeatAvailability
  entities/reservation/model/query-keys.ts, api/queries.ts, lib/time-slots.ts(+test), lib/overlap.ts(+test), ui/reservation-card.tsx, index.ts
  entities/room/api/queries.ts                        (수정) availability 쿼리
  entities/room/ui/room-map.tsx, index.ts             읽기 전용 배치도
  features/reservation-create/api/mutations.ts, ui/time-range-picker.tsx, ui/reserve-panel.tsx, index.ts
  features/reservation-cancel/api/mutations.ts, ui/cancel-reservation-button.tsx, index.ts
  widgets/room-reservation/ui/room-reservation.tsx, index.ts
  widgets/my-reservations/ui/my-reservations.tsx, index.ts
  widgets/admin-reservations/ui/admin-reservations.tsx, index.ts
  app/(user)/rooms/[roomId]/page.tsx                  (수정) 위젯 사용
  app/(user)/reservations/page.tsx
  app/(admin)/admin/reservations/page.tsx
```

---

### Task 1: DB 뷰 + 계약 갱신 + 시간 슬롯/겹침 순수 로직

**Files:**
- Create: `supabase/migrations/0002_reservation_details.sql`
- Modify: `scripts/db-smoke.sh` (뷰 확인)
- Regenerate: `src/app/api/_server/db/database.types.ts`
- Modify: `src/shared/contracts/reservation.ts`
- Create: `src/entities/reservation/lib/time-slots.ts`, `time-slots.test.ts`, `lib/overlap.ts`, `overlap.test.ts`

**Interfaces:**
- Produces (contracts): `ReservationDto` 에 `userName: string` 추가, `SEAT_AVAILABILITY = ["available","reserved","mine","disabled"]`, `SeatAvailability`, `adminReservationsQuerySchema { roomId?: uuid; date?: YYYY-MM-DD }`, `AdminReservationsQuery`.
- Produces (time-slots): `KST_OFFSET = "+09:00"`, `OPEN_HOUR = 9`, `CLOSE_HOUR = 22`, `SLOT_MINUTES = 30`, `buildTimeSlots(): string[]` ("09:00" … "22:00"), `toKstIso(date: string, time: string): string`, `todayKst(now?: Date): string`, `nextSlotAfter(now?: Date): { date: string; time: string } | null`, `addSlots(time: string, count: number): string | null`, `formatKst(iso: string): string` ("9/15 (월) 09:00").
- Produces (overlap): `overlaps(aStart, aEnd, bStart, bEnd): boolean` (반열림 구간 `[start, end)`).

- [x] **Step 1: 마이그레이션** — `supabase/migrations/0002_reservation_details.sql`

```sql
-- 예약 조회용 뷰. 좌석명·룸명·사용자명을 한 번에 조인한다.
-- security_invoker: 호출자의 RLS 가 적용된다 → 일반 사용자는 본인 예약만, admin 은 전체.
create view public.reservation_details
with (security_invoker = true) as
select
  r.id,
  r.user_id,
  p.name        as user_name,
  r.seat_id,
  s.name        as seat_name,
  so.room_id,
  rm.name       as room_name,
  r.start_at,
  r.end_at,
  r.status,
  r.created_at,
  r.cancelled_at
from public.reservations r
join public.seats s          on s.id = r.seat_id
join public.space_objects so on so.id = s.space_object_id
join public.rooms rm         on rm.id = so.room_id
join public.profiles p       on p.id = r.user_id;

grant select on public.reservation_details to authenticated;
```

`scripts/db-smoke.sh` 마지막 `select 'ALL SMOKE PASSED';` 바로 앞에 추가:
```sql
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select 'view rows for user: ' || count(*) || ' (expect 2)' from public.reservation_details;
select 'view has names: ' || bool_and(seat_name = 'A1-renamed' and room_name = 'Room A' and user_name = 'user') from public.reservation_details;
```
(주의: 스모크는 모든 마이그레이션을 순서대로 적용한 뒤 실행되므로 0002 의 뷰가 존재한다. profiles.name 은 이메일 local part `user`.)

- [x] **Step 2: 로컬 검증 → 원격 적용 → 타입 재생성**

```bash
pnpm db:smoke                     # ALL SMOKE PASSED + view 2줄 확인
supabase db push --yes            # 0002 적용
supabase migration list           # 0002 가 Local/Remote 양쪽
supabase gen types typescript --linked --schema public > /tmp/db.types.ts
{ printf '// 생성 파일. 직접 수정 금지. 마이그레이션 변경 후 재생성:\n//   supabase gen types typescript --linked --schema public > src/app/api/_server/db/database.types.ts\n// (첫 두 줄 주석은 다시 붙인다)\n\n'; cat /tmp/db.types.ts; } > src/app/api/_server/db/database.types.ts
grep -n "reservation_details" src/app/api/_server/db/database.types.ts | head -2   # Views 아래 존재
```

- [x] **Step 3: 계약 수정** — `src/shared/contracts/reservation.ts` (전체 교체)

```ts
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
```

- [x] **Step 4: 실패하는 테스트** — `src/entities/reservation/lib/time-slots.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  addSlots,
  buildTimeSlots,
  formatKst,
  nextSlotAfter,
  toKstIso,
  todayKst,
} from "./time-slots";

describe("time-slots", () => {
  it("buildTimeSlots 는 09:00 부터 22:00 까지 30분 간격 27개", () => {
    const slots = buildTimeSlots();
    expect(slots[0]).toBe("09:00");
    expect(slots[1]).toBe("09:30");
    expect(slots[slots.length - 1]).toBe("22:00");
    expect(slots).toHaveLength(27);
  });

  it("toKstIso 는 +09:00 오프셋이 붙은 ISO 문자열을 만든다 (서버 UTC 와 무관)", () => {
    expect(toKstIso("2026-09-15", "09:00")).toBe("2026-09-15T09:00:00+09:00");
    expect(new Date(toKstIso("2026-09-15", "09:00")).toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("todayKst 는 UTC 자정 직전에도 한국 날짜를 준다", () => {
    // UTC 2026-09-14 16:30 = KST 2026-09-15 01:30
    expect(todayKst(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  });

  it("nextSlotAfter 는 현재 시각 이후 첫 30분 경계를 주고, 영업 종료 후면 다음날 09:00", () => {
    // KST 10:10 → 10:30
    expect(nextSlotAfter(new Date("2026-09-15T01:10:00Z"))).toEqual({ date: "2026-09-15", time: "10:30" });
    // KST 10:30 정각 → 11:00 (같은 슬롯은 이미 시작됨)
    expect(nextSlotAfter(new Date("2026-09-15T01:30:00Z"))).toEqual({ date: "2026-09-15", time: "11:00" });
    // KST 22:10 → 다음날 09:00
    expect(nextSlotAfter(new Date("2026-09-15T13:10:00Z"))).toEqual({ date: "2026-09-16", time: "09:00" });
    // KST 06:00 → 당일 09:00
    expect(nextSlotAfter(new Date("2026-09-14T21:00:00Z"))).toEqual({ date: "2026-09-15", time: "09:00" });
  });

  it("addSlots 는 30분 단위로 더하고 영업 종료(22:00)를 넘으면 null", () => {
    expect(addSlots("09:00", 2)).toBe("10:00");
    expect(addSlots("21:30", 1)).toBe("22:00");
    expect(addSlots("21:30", 2)).toBeNull();
  });

  it("formatKst 는 한국 시간으로 'M/D (요일) HH:mm'", () => {
    expect(formatKst("2026-09-15T09:00:00+09:00")).toBe("9/15 (화) 09:00");
    expect(formatKst("2026-09-14T16:30:00Z")).toBe("9/15 (화) 01:30");
  });
});
```

`src/entities/reservation/lib/overlap.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { overlaps } from "./overlap";

// PRD 12.2: newStart < existingEnd AND newEnd > existingStart. 구간은 [start, end)
describe("overlaps", () => {
  const a = ["2026-09-15T10:00:00+09:00", "2026-09-15T12:00:00+09:00"] as const;

  it("부분 겹침은 true", () => {
    expect(overlaps(a[0], a[1], "2026-09-15T11:00:00+09:00", "2026-09-15T13:00:00+09:00")).toBe(true);
  });

  it("끝과 시작이 맞닿으면(12:00~14:00) false — DB 의 '[)' 와 같은 규칙", () => {
    expect(overlaps(a[0], a[1], "2026-09-15T12:00:00+09:00", "2026-09-15T14:00:00+09:00")).toBe(false);
  });

  it("포함 관계는 true, 완전히 떨어지면 false", () => {
    expect(overlaps(a[0], a[1], "2026-09-15T10:30:00+09:00", "2026-09-15T11:00:00+09:00")).toBe(true);
    expect(overlaps(a[0], a[1], "2026-09-15T08:00:00+09:00", "2026-09-15T09:00:00+09:00")).toBe(false);
  });
});
```

- [x] **Step 5: 실패 확인**

Run: `pnpm test src/entities/reservation`
Expected: FAIL (모듈 없음)

- [x] **Step 6: 구현**

`src/entities/reservation/lib/time-slots.ts`
```ts
/**
 * 예약 시간 슬롯 규칙 (PRD 부록): 30분 단위, 09:00~22:00, 타임존 Asia/Seoul 고정.
 * 서버(Vercel)는 UTC 라 "오늘"·"다음 슬롯" 계산은 클라이언트에서 이 모듈로만 한다 (D-33).
 * 한국은 DST 가 없어 고정 오프셋 +09:00 으로 계산해도 안전하다.
 */
export const KST_OFFSET = "+09:00";
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 22;
export const SLOT_MINUTES = 30;

const KST_MS = 9 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "09:00" … "22:00". 22:00 은 종료 시각으로만 쓰인다 */
export function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += SLOT_MINUTES) {
    slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return slots;
}

/** 날짜 + 시각 → 오프셋이 명시된 ISO. 서버는 이 문자열을 그대로 timestamptz 로 저장 */
export function toKstIso(date: string, time: string): string {
  return `${date}T${time}:00${KST_OFFSET}`;
}

/** now 를 KST 로 옮긴 Date (getUTC* 로 읽으면 KST 값이 나온다) */
function toKst(now: Date): Date {
  return new Date(now.getTime() + KST_MS);
}

export function todayKst(now = new Date()): string {
  const k = toKst(now);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

/**
 * 지금 이후 예약 가능한 첫 슬롯. 영업 전이면 당일 09:00, 영업 종료 후면 다음날 09:00.
 * 정각/30분 정각은 "이미 시작한 슬롯" 이므로 다음 슬롯으로 넘긴다.
 */
export function nextSlotAfter(now = new Date()): { date: string; time: string } {
  const k = toKst(now);
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  let next = (Math.floor(minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES;
  let day = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));

  if (next < OPEN_HOUR * 60) next = OPEN_HOUR * 60;
  // 마지막 시작 가능 슬롯은 21:30 (22:00 은 종료 전용)
  if (next > CLOSE_HOUR * 60 - SLOT_MINUTES) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    next = OPEN_HOUR * 60;
  }
  return {
    date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
    time: `${pad(Math.floor(next / 60))}:${pad(next % 60)}`,
  };
}

/** "HH:mm" 에 슬롯 count 개를 더한다. 22:00 을 넘으면 null */
export function addSlots(time: string, count: number): string | null {
  const [h, m] = time.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + count * SLOT_MINUTES;
  if (total > CLOSE_HOUR * 60) return null;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 목록·카드 표시용. 항상 KST 로 렌더 (서버·브라우저 어디서 실행돼도 같은 문자열) */
export function formatKst(iso: string): string {
  const k = toKst(new Date(iso));
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${WEEKDAYS[k.getUTCDay()]}) ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
```

`src/entities/reservation/lib/overlap.ts`
```ts
/**
 * 두 구간 [aStart, aEnd) 와 [bStart, bEnd) 가 겹치는가. PRD 12.2 의 조건과 동일.
 * UI 표시 보조용. 실제 무결성은 DB exclusion constraint(reservations_no_overlap) 가 보장한다 (D-29).
 */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return bs < ae && be > as;
}
```

- [x] **Step 7: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 테스트 76개 통과 (67 + 9)

- [x] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(reservation): reservation_details 뷰, 계약 갱신, 시간 슬롯·겹침 순수 로직"
```

---

### Task 2: 예약 API — 생성/내 목록/취소/가용성/관리자 현황

**Files:**
- Create: `src/app/api/_server/reservations/reservations.mapper.ts`, `reservations.mapper.test.ts`
- Create: `src/app/api/_server/reservations/reservations.service.ts`
- Create: `src/app/api/_server/reservations/availability.service.ts`
- Create: `src/app/api/reservations/route.ts`
- Create: `src/app/api/reservations/[reservationId]/cancel/route.ts`
- Create: `src/app/api/rooms/[roomId]/availability/route.ts`
- Create: `src/app/api/admin/reservations/route.ts`

**Interfaces:**
- Consumes: `Tables<"reservation_details">`, `Tables<"seats">`, http 헬퍼, `KST_OFFSET` 는 서버에서도 필요 → `@/shared/contracts` 가 아니라 entities 라 서버가 import 불가. 서버는 문자열 `"+09:00"` 을 `_server/reservations` 안 상수로 둔다.
- Produces: `toReservationDto(row: Tables<"reservation_details">): ReservationDto`, `listMyReservations(supabase, userId)`, `createReservation(supabase, userId, input)`, `cancelReservation(supabase, reservationId)`, `listAllReservations(supabase, query)`, `getSeatAvailability(supabase, roomId, query): Promise<AvailabilityDto>`.

- [x] **Step 1: 실패하는 테스트** — `reservations.mapper.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toReservationDto } from "./reservations.mapper";

describe("toReservationDto", () => {
  it("뷰 행을 camelCase DTO 로 바꾼다", () => {
    expect(
      toReservationDto({
        id: "rv1",
        user_id: "u1",
        user_name: "테스터",
        seat_id: "s1",
        seat_name: "A1",
        room_id: "r1",
        room_name: "1층",
        start_at: "2026-09-15T00:00:00+00:00",
        end_at: "2026-09-15T01:00:00+00:00",
        status: "reserved",
        created_at: "2026-09-14T00:00:00+00:00",
        cancelled_at: null,
      }),
    ).toEqual({
      id: "rv1",
      userId: "u1",
      userName: "테스터",
      seatId: "s1",
      seatName: "A1",
      roomId: "r1",
      roomName: "1층",
      startAt: "2026-09-15T00:00:00+00:00",
      endAt: "2026-09-15T01:00:00+00:00",
      status: "reserved",
      createdAt: "2026-09-14T00:00:00+00:00",
      cancelledAt: null,
    });
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/_server/reservations`

- [x] **Step 3: 구현**

`reservations.mapper.ts`
```ts
import type { ReservationDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

/** 뷰 컬럼은 전부 nullable 로 생성될 수 있다(뷰 타입 추론 한계). 조인 조건상 실제로는 null 이 없다. */
type Row = Tables<"reservation_details">;

function req<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`reservation_details.${name} 이 null 입니다.`);
  return value;
}

export function toReservationDto(row: Row): ReservationDto {
  return {
    id: req(row.id, "id"),
    userId: req(row.user_id, "user_id"),
    userName: req(row.user_name, "user_name"),
    seatId: req(row.seat_id, "seat_id"),
    seatName: req(row.seat_name, "seat_name"),
    roomId: req(row.room_id, "room_id"),
    roomName: req(row.room_name, "room_name"),
    startAt: req(row.start_at, "start_at"),
    endAt: req(row.end_at, "end_at"),
    status: req(row.status, "status"),
    createdAt: req(row.created_at, "created_at"),
    cancelledAt: row.cancelled_at,
  };
}
```
(생성 타입에서 뷰 컬럼이 non-null 로 나오면 `req` 는 그대로 두어도 무해하다. 타입 에러가 나면 `req` 호출을 제거한다.)

`reservations.service.ts`
```ts
import type {
  AdminReservationsQuery,
  CreateReservationInput,
  ReservationDto,
} from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";
import { toReservationDto } from "./reservations.mapper";

const KST_OFFSET = "+09:00";

/** 본인 예약 전체(취소 포함). RLS 가 user_id = auth.uid() 로 거른다. 시작 시각 내림차순 */
export async function listMyReservations(
  supabase: ServerSupabase,
  userId: string,
): Promise<ReservationDto[]> {
  const { data, error } = await supabase
    .from("reservation_details")
    .select("*")
    .eq("user_id", userId)
    .order("start_at", { ascending: false });
  if (error) throw mapPostgresError(error);
  return data.map(toReservationDto);
}

async function getReservation(supabase: ServerSupabase, id: string): Promise<ReservationDto> {
  const { data, error } = await supabase
    .from("reservation_details")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "예약을 찾을 수 없습니다.");
  return toReservationDto(data);
}

/**
 * 예약 생성. 겹침은 검사하지 않는다 — insert 가 23P01 이면 mapPostgresError 가 409 reservation_overlap.
 * 사전 검사는 UX 메시지를 위한 것만: 과거 시각, 사용 불가 좌석.
 */
export async function createReservation(
  supabase: ServerSupabase,
  userId: string,
  input: CreateReservationInput,
): Promise<ReservationDto> {
  if (new Date(input.startAt).getTime() <= Date.now()) {
    throw new ApiHttpError(400, "invalid_input", "지난 시각은 예약할 수 없습니다.");
  }

  const { data: seat, error: seatError } = await supabase
    .from("seats")
    .select("status")
    .eq("id", input.seatId)
    .maybeSingle();
  if (seatError) throw mapPostgresError(seatError);
  if (!seat) throw new ApiHttpError(404, "not_found", "좌석을 찾을 수 없습니다.");
  if (seat.status === "disabled") {
    throw new ApiHttpError(400, "invalid_input", "사용 불가 좌석입니다.");
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({ user_id: userId, seat_id: input.seatId, start_at: input.startAt, end_at: input.endAt })
    .select("id")
    .single();
  if (error) throw mapPostgresError(error);
  return getReservation(supabase, data.id);
}

/** 취소(soft). RLS: 본인 또는 admin. 이미 취소된 예약은 그대로 반환(멱등). */
export async function cancelReservation(
  supabase: ServerSupabase,
  reservationId: string,
): Promise<ReservationDto> {
  const current = await getReservation(supabase, reservationId); // 없거나 권한 없으면 404
  if (current.status === "cancelled") return current;

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw mapPostgresError(error);
  return getReservation(supabase, reservationId);
}

/** 관리자 현황. roomId / date(KST 하루) 필터. 취소 포함, 시작 시각 오름차순 */
export async function listAllReservations(
  supabase: ServerSupabase,
  query: AdminReservationsQuery,
): Promise<ReservationDto[]> {
  let q = supabase.from("reservation_details").select("*").order("start_at", { ascending: true });
  if (query.roomId) q = q.eq("room_id", query.roomId);
  if (query.date) {
    const dayStart = `${query.date}T00:00:00${KST_OFFSET}`;
    const nextDay = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("start_at", dayStart).lt("start_at", nextDay);
  }
  const { data, error } = await q;
  if (error) throw mapPostgresError(error);
  return data.map(toReservationDto);
}
```

`availability.service.ts`
```ts
import type { AvailabilityDto, AvailabilityQuery } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { mapPostgresError } from "../http/errors";

/**
 * 시간 범위와 겹치는 reserved 예약의 seat_id 만. security definer RPC 라 남의 예약 행은 노출되지 않는다.
 * 뷰어는 이 목록 + 좌석 status 로 available / reserved / mine / disabled 를 그린다.
 */
export async function getSeatAvailability(
  supabase: ServerSupabase,
  roomId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityDto> {
  const { data, error } = await supabase.rpc("get_seat_availability", {
    p_room_id: roomId,
    p_start_at: query.startAt,
    p_end_at: query.endAt,
  });
  if (error) throw mapPostgresError(error);
  return { occupied: data.map((r) => ({ seatId: r.seat_id, mine: r.mine })) };
}
```

`src/app/api/reservations/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import {
  createReservation,
  listMyReservations,
} from "@/app/api/_server/reservations/reservations.service";
import { createReservationSchema } from "@/shared/contracts";

/** GET /api/reservations — 내 예약 */
export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  return ok(await listMyReservations(supabase, user.id));
});

/** POST /api/reservations — 201 | 409 reservation_overlap */
export const POST = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  const input = await parseBody(req, createReservationSchema);
  return ok(await createReservation(supabase, user.id, input), 201);
});
```

`src/app/api/reservations/[reservationId]/cancel/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { cancelReservation } from "@/app/api/_server/reservations/reservations.service";

type Ctx = { params: Promise<{ reservationId: string }> };

/** POST /api/reservations/:id/cancel — 상태 전이는 동사 서브리소스 (D-13) */
export const POST = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { reservationId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await cancelReservation(supabase, reservationId));
});
```

`src/app/api/rooms/[roomId]/availability/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseQuery } from "@/app/api/_server/http/validate";
import { getSeatAvailability } from "@/app/api/_server/reservations/availability.service";
import { availabilityQuerySchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ roomId: string }> };

/** GET /api/rooms/:roomId/availability?startAt=&endAt= */
export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  const query = parseQuery(new URL(req.url), availabilityQuerySchema);
  return ok(await getSeatAvailability(supabase, roomId, query));
});
```

`src/app/api/admin/reservations/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseQuery } from "@/app/api/_server/http/validate";
import { listAllReservations } from "@/app/api/_server/reservations/reservations.service";
import { adminReservationsQuerySchema } from "@/shared/contracts";

/** GET /api/admin/reservations?roomId&date — admin */
export const GET = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const query = parseQuery(new URL(req.url), adminReservationsQuerySchema);
  return ok(await listAllReservations(supabase, query));
});
```

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 5: 동작 확인** (dev :3000, admin jar `$J`. 좌석 id 는 layout 에서 가져옴)

```bash
R=<room id>; SEAT=$(curl -s -b $J http://localhost:3000/api/rooms/$R/layout | python3 -c "import sys,json; print([o for o in json.load(sys.stdin)['objects'] if o['type']=='seat'][0]['seat']['id'])")
D=$(date -v+1d +%F)   # 내일 (macOS)
curl -s -b $J -H 'Content-Type: application/json' -d "{\"seatId\":\"$SEAT\",\"startAt\":\"${D}T10:00:00+09:00\",\"endAt\":\"${D}T12:00:00+09:00\"}" -w " [%{http_code}]\n" http://localhost:3000/api/reservations
curl -s -b $J -H 'Content-Type: application/json' -d "{\"seatId\":\"$SEAT\",\"startAt\":\"${D}T11:00:00+09:00\",\"endAt\":\"${D}T13:00:00+09:00\"}" -w " [%{http_code}]\n" http://localhost:3000/api/reservations   # 409
curl -s -b $J -H 'Content-Type: application/json' -d "{\"seatId\":\"$SEAT\",\"startAt\":\"${D}T12:00:00+09:00\",\"endAt\":\"${D}T13:00:00+09:00\"}" -w " [%{http_code}]\n" http://localhost:3000/api/reservations   # 201 (인접)
curl -s -b $J "http://localhost:3000/api/rooms/$R/availability?startAt=${D}T10:30:00%2B09:00&endAt=${D}T11:00:00%2B09:00"; echo   # occupied 1, mine true
curl -s -b $J http://localhost:3000/api/reservations | python3 -c "import sys,json; rs=json.load(sys.stdin); print(len(rs), rs[0]['seatName'], rs[0]['roomName'], rs[0]['userName'])"
ID=$(curl -s -b $J http://localhost:3000/api/reservations | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -s -b $J -X POST -w " [%{http_code}]\n" http://localhost:3000/api/reservations/$ID/cancel | cut -c1-80   # status cancelled
curl -s -b $J -H 'Content-Type: application/json' -d "{\"seatId\":\"$SEAT\",\"startAt\":\"2020-01-01T10:00:00+09:00\",\"endAt\":\"2020-01-01T11:00:00+09:00\"}" -w " [%{http_code}]\n" http://localhost:3000/api/reservations   # 400 지난 시각
curl -s -b $J "http://localhost:3000/api/admin/reservations?roomId=$R&date=$D" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
```

- [x] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(api): 예약 생성/내 목록/취소/가용성/관리자 현황 - 겹침은 DB 23P01 → 409"
```

---

### Task 3: entities — 예약 쿼리, 가용성 쿼리, 읽기 전용 배치도(RoomMap)

**Files:**
- Create: `src/entities/reservation/model/query-keys.ts`, `api/queries.ts`, `ui/reservation-card.tsx`, `index.ts`
- Modify: `src/entities/room/api/queries.ts` (availability), `src/entities/room/index.ts`
- Create: `src/entities/room/ui/room-map.tsx`

**Interfaces:**
- Produces: `reservationKeys.all/mine()/admin(query)`, `reservationQueries.mine(ctx?)`, `reservationQueries.admin(query, ctx?)`, `roomQueries.availability(roomId, startAt, endAt)` (staleTime 15s, refetchOnWindowFocus), `<RoomMap layout seatStatusOf selectedSeatId onSelectSeat />`, `<ReservationCard reservation actions? />`.

- [ ] **Step 1: 구현**

`src/entities/reservation/model/query-keys.ts`
```ts
import type { AdminReservationsQuery } from "@/shared/contracts";

export const reservationKeys = {
  all: ["reservations"] as const,
  mine: () => [...reservationKeys.all, "mine"] as const,
  admin: (query: AdminReservationsQuery) => [...reservationKeys.all, "admin", query] as const,
};
```

`src/entities/reservation/api/queries.ts`
```ts
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
```

`src/entities/reservation/ui/reservation-card.tsx`
```tsx
import type { ReactNode } from "react";
import type { ReservationDto } from "@/shared/contracts";
import { formatKst } from "../lib/time-slots";

interface Props {
  reservation: ReservationDto;
  /** 우측 액션 슬롯 (취소 버튼 등). features 가 주입한다 — entities 는 features 를 모른다 */
  actions?: ReactNode;
  showUser?: boolean;
}

export function ReservationCard({ reservation, actions, showUser = false }: Props) {
  const cancelled = reservation.status === "cancelled";
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border bg-white p-4 ${cancelled ? "border-zinc-200 opacity-60" : "border-zinc-300"}`}
    >
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-medium">
          {reservation.roomName} · {reservation.seatName}
        </span>
        <span className="text-zinc-600">
          {formatKst(reservation.startAt)} ~ {formatKst(reservation.endAt).slice(-5)}
        </span>
        {showUser ? <span className="text-zinc-500">{reservation.userName}</span> : null}
        {cancelled ? <span className="text-xs text-zinc-500">취소됨</span> : null}
      </div>
      {actions}
    </div>
  );
}
```

`src/entities/reservation/index.ts`
```ts
export { reservationKeys } from "./model/query-keys";
export { reservationQueries } from "./api/queries";
export { ReservationCard } from "./ui/reservation-card";
export {
  KST_OFFSET,
  OPEN_HOUR,
  CLOSE_HOUR,
  SLOT_MINUTES,
  buildTimeSlots,
  toKstIso,
  todayKst,
  nextSlotAfter,
  addSlots,
  formatKst,
} from "./lib/time-slots";
export { overlaps } from "./lib/overlap";
```

`src/entities/room/api/queries.ts` — `roomQueries` 에 추가 (`AvailabilityDto` import):
```ts
  /** 가용성은 다른 사용자의 예약이 곧 반영돼야 하므로 짧은 staleTime + 포커스 refetch (스펙 8절) */
  availability: (roomId: string, startAt: string, endAt: string) =>
    queryOptions({
      queryKey: roomKeys.availability(roomId, startAt, endAt),
      queryFn: () =>
        apiFetch<AvailabilityDto>(
          `/api/rooms/${roomId}/availability?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`,
        ),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
    }),
```

`src/entities/room/ui/room-map.tsx`
```tsx
"use client";

import type { LayoutDto, SeatAvailability, SpaceObjectDto } from "@/shared/contracts";

interface Props {
  layout: LayoutDto;
  /** 좌석 seat.id → 상태. 위젯이 가용성 응답과 좌석 status 를 합쳐 넘긴다 */
  seatStatusOf: (seatId: string) => SeatAvailability;
  selectedSeatId: string | null;
  onSelectSeat: (seatId: string) => void;
}

const SEAT_FILL: Record<SeatAvailability, string> = {
  available: "#dbeafe",
  reserved: "#fecaca",
  mine: "#bbf7d0",
  disabled: "#e4e4e7",
};
const SEAT_TEXT: Record<SeatAvailability, string> = {
  available: "#1e3a8a",
  reserved: "#7f1d1d",
  mine: "#14532d",
  disabled: "#71717a",
};

/**
 * 읽기 전용 배치도 (예약용). 에디터와 좌표계는 같지만 뷰포트가 없다:
 * viewBox = room 전체라 컨테이너 폭에 맞춰 자동으로 fit 되고, 모바일에서는 브라우저 핀치줌으로 확대한다.
 * 클릭 가능한 좌석은 available / mine 뿐.
 */
export function RoomMap({ layout, seatStatusOf, selectedSeatId, onSelectSeat }: Props) {
  const objects = [...layout.objects].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="h-auto w-full max-h-[70vh] rounded-lg border border-zinc-200 bg-white"
      role="img"
      aria-label="좌석 배치도"
    >
      {objects.map((o) => (
        <MapObject
          key={o.id}
          object={o}
          status={o.type === "seat" ? seatStatusOf(o.seat.id) : null}
          selected={o.type === "seat" && o.seat.id === selectedSeatId}
          onSelect={onSelectSeat}
        />
      ))}
    </svg>
  );
}

function MapObject({
  object,
  status,
  selected,
  onSelect,
}: {
  object: SpaceObjectDto;
  status: SeatAvailability | null;
  selected: boolean;
  onSelect: (seatId: string) => void;
}) {
  const { x, y, width, height, rotation } = object;
  const transform = `translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})`;

  if (object.type === "seat" && status) {
    const clickable = status === "available" || status === "mine";
    return (
      <g
        transform={transform}
        className={clickable ? "cursor-pointer" : "cursor-not-allowed"}
        onClick={() => clickable && onSelect(object.seat.id)}
        role="button"
        aria-label={`${object.seat.name} ${status}`}
        aria-disabled={!clickable}
        data-seat-id={object.seat.id}
        data-status={status}
      >
        <rect
          width={width}
          height={height}
          rx={6}
          fill={SEAT_FILL[status]}
          stroke={selected ? "#2563eb" : "#a1a1aa"}
          strokeWidth={selected ? 3 : 1}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill={SEAT_TEXT[status]}
          className="pointer-events-none select-none"
        >
          {object.seat.name}
        </text>
      </g>
    );
  }

  return (
    <g transform={transform}>
      <rect
        width={width}
        height={height}
        rx={2}
        fill={object.type === "table" ? "#fef3c7" : "#52525b"}
        stroke={object.type === "table" ? "#f59e0b" : "#3f3f46"}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
```

`src/entities/room/index.ts` 에 `export { RoomMap } from "./ui/room-map";` 추가.

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "feat(entities): 예약 쿼리·카드, 가용성 쿼리(staleTime 15s), 읽기 전용 배치도 RoomMap"
```

---

### Task 4: features — 시간 선택, 예약 생성, 예약 취소

**Files:**
- Create: `src/features/reservation-create/api/mutations.ts`, `ui/time-range-picker.tsx`, `ui/reserve-panel.tsx`, `index.ts`
- Create: `src/features/reservation-cancel/api/mutations.ts`, `ui/cancel-reservation-button.tsx`, `index.ts`

**Interfaces:**
- Produces: `TimeRange { date: string; startTime: string; endTime: string }`, `useDefaultTimeRange(): TimeRange`, `toIsoRange(range): { startAt; endAt } | null`, `<TimeRangePicker value onChange />`, `useCreateReservation(roomId)`, `<ReservePanel roomId seat range onDone />`, `useCancelReservation()`, `<CancelReservationButton reservation />`.

- [ ] **Step 1: 구현**

`src/features/reservation-create/ui/time-range-picker.tsx`
```tsx
"use client";

import { useMemo } from "react";
import { addSlots, buildTimeSlots, nextSlotAfter, todayKst, toKstIso } from "@/entities/reservation";
import { Field, Input } from "@/shared/ui";

export interface TimeRange {
  date: string; // YYYY-MM-DD (KST)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** 기본값: 지금 이후 첫 슬롯부터 1시간 */
export function defaultTimeRange(now = new Date()): TimeRange {
  const next = nextSlotAfter(now);
  return { date: next.date, startTime: next.time, endTime: addSlots(next.time, 2) ?? "22:00" };
}

/** 선택값을 API 가 받는 ISO 범위로. 시작 ≥ 종료면 null */
export function toIsoRange(range: TimeRange): { startAt: string; endAt: string } | null {
  if (range.startTime >= range.endTime) return null;
  return { startAt: toKstIso(range.date, range.startTime), endAt: toKstIso(range.date, range.endTime) };
}

interface Props {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}

/**
 * 날짜 + 시작/종료 30분 슬롯 (PRD 부록: 날짜/시간을 먼저 고른다). 오늘~14일 후까지.
 * 종료 목록은 시작 이후 슬롯만. 시작을 바꿔 종료가 무효해지면 +1시간으로 맞춘다.
 */
export function TimeRangePicker({ value, onChange }: Props) {
  const slots = useMemo(() => buildTimeSlots(), []);
  const startOptions = slots.slice(0, -1); // 22:00 은 시작 불가
  const endOptions = slots.filter((s) => s > value.startTime);
  const min = todayKst();
  const max = useMemo(() => {
    const d = new Date(`${min}T00:00:00+09:00`);
    d.setDate(d.getDate() + 14);
    return todayKst(d);
  }, [min]);

  const selectClass = "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="날짜" htmlFor="res-date">
        <Input
          id="res-date"
          type="date"
          min={min}
          max={max}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </Field>
      <Field label="시작" htmlFor="res-start">
        <select
          id="res-start"
          className={selectClass}
          value={value.startTime}
          onChange={(e) => {
            const startTime = e.target.value;
            const endTime =
              value.endTime > startTime ? value.endTime : (addSlots(startTime, 2) ?? "22:00");
            onChange({ ...value, startTime, endTime });
          }}
        >
          {startOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="종료" htmlFor="res-end">
        <select
          id="res-end"
          className={selectClass}
          value={value.endTime}
          onChange={(e) => onChange({ ...value, endTime: e.target.value })}
        >
          {endOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
```

`src/features/reservation-create/api/mutations.ts`
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { CreateReservationInput, ReservationDto } from "@/shared/contracts";
import { reservationKeys } from "@/entities/reservation";
import { roomKeys } from "@/entities/room";

/**
 * 예약 생성. 성공·실패 모두 가용성을 다시 받는다 — 409 면 방금 다른 사람이 잡은 것이므로
 * 배치도를 즉시 갱신해 사용자가 다른 좌석을 고르게 한다.
 */
export function useCreateReservation(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiFetch<ReservationDto>("/api/reservations", { method: "POST", body: input }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.availability(roomId, "", "").slice(0, 3) });
      await queryClient.invalidateQueries({ queryKey: reservationKeys.mine() });
    },
  });
}
```
(`roomKeys.availability(roomId, "", "").slice(0, 3)` = `["rooms","availability",roomId]` 접두 → 해당 room 의 모든 시간 범위 가용성 무효화.)

`src/features/reservation-create/ui/reserve-panel.tsx`
```tsx
"use client";

import { ApiError } from "@/shared/api";
import type { SeatObjectDto } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { formatKst } from "@/entities/reservation";
import { useCreateReservation } from "../api/mutations";
import { toIsoRange, type TimeRange } from "./time-range-picker";

interface Props {
  roomId: string;
  seat: SeatObjectDto | null;
  range: TimeRange;
  /** 예약 성공 후 선택 해제 등 */
  onReserved: () => void;
}

/** 선택한 좌석 + 시간 확인 → 예약 버튼. 409 는 "방금 예약됨" 안내 */
export function ReservePanel({ roomId, seat, range, onReserved }: Props) {
  const create = useCreateReservation(roomId);
  const iso = toIsoRange(range);

  if (!seat) {
    return (
      <p className="text-sm text-zinc-600">
        배치도에서 예약할 좌석을 선택하세요. 파랑 = 가능, 빨강 = 예약됨, 초록 = 내 예약, 회색 = 사용 불가
      </p>
    );
  }

  const error =
    create.error instanceof ApiError
      ? create.error.code === "reservation_overlap"
        ? "방금 다른 사용자가 예약했습니다. 다른 좌석이나 시간을 선택하세요."
        : create.error.message
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white p-4">
      <div className="text-sm">
        <p className="font-medium">{seat.seat.name}</p>
        {iso ? (
          <p className="text-zinc-600">
            {formatKst(iso.startAt)} ~ {formatKst(iso.endAt).slice(-5)}
          </p>
        ) : (
          <p className="text-red-600">종료 시각은 시작보다 늦어야 합니다.</p>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {create.isSuccess ? <p className="text-sm text-green-700">예약되었습니다.</p> : null}
      <Button
        disabled={!iso || create.isPending}
        onClick={() => {
          if (!iso) return;
          create.mutate({ seatId: seat.seat.id, ...iso }, { onSuccess: onReserved });
        }}
      >
        {create.isPending ? "예약 중..." : "예약하기"}
      </Button>
    </div>
  );
}
```

`src/features/reservation-create/index.ts`
```ts
export { TimeRangePicker, defaultTimeRange, toIsoRange, type TimeRange } from "./ui/time-range-picker";
export { ReservePanel } from "./ui/reserve-panel";
export { useCreateReservation } from "./api/mutations";
```

`src/features/reservation-cancel/api/mutations.ts`
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { ReservationDto } from "@/shared/contracts";
import { reservationKeys } from "@/entities/reservation";
import { roomKeys } from "@/entities/room";

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reservationId: string) =>
      apiFetch<ReservationDto>(`/api/reservations/${reservationId}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reservationKeys.all });
      // 취소된 좌석이 다시 비었으므로 가용성 전부 무효화
      await queryClient.invalidateQueries({ queryKey: [...roomKeys.all, "availability"] });
    },
  });
}
```

`src/features/reservation-cancel/ui/cancel-reservation-button.tsx`
```tsx
"use client";

import type { ReservationDto } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { useCancelReservation } from "../api/mutations";

/** 시작 전 reserved 예약만 취소 버튼을 보여준다 */
export function CancelReservationButton({ reservation }: { reservation: ReservationDto }) {
  const cancel = useCancelReservation();
  const cancellable =
    reservation.status === "reserved" && new Date(reservation.startAt).getTime() > Date.now();
  if (!cancellable) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={cancel.isPending}
      onClick={() => {
        if (window.confirm("이 예약을 취소할까요?")) cancel.mutate(reservation.id);
      }}
    >
      {cancel.isPending ? "취소 중..." : "취소"}
    </Button>
  );
}
```

`src/features/reservation-cancel/index.ts`
```ts
export { CancelReservationButton } from "./ui/cancel-reservation-button";
export { useCancelReservation } from "./api/mutations";
```

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "feat(reservation): 시간 범위 선택, 예약 생성 패널(409 안내), 예약 취소 버튼"
```

---

### Task 5: 공간 상세 = 예약 화면 (widget + 페이지)

**Files:**
- Create: `src/widgets/room-reservation/ui/room-reservation.tsx`, `index.ts`
- Modify: `src/app/(user)/rooms/[roomId]/page.tsx`

- [ ] **Step 1: 구현**

`src/widgets/room-reservation/ui/room-reservation.tsx`
```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { SeatAvailability, SeatObjectDto } from "@/shared/contracts";
import { RoomMap, roomQueries } from "@/entities/room";
import {
  ReservePanel,
  TimeRangePicker,
  defaultTimeRange,
  toIsoRange,
  type TimeRange,
} from "@/features/reservation-create";

/**
 * PRD 12.1 + 부록 순서: 시간 선택 → 가용성 조회 → 배치도에 상태 표시 → 좌석 선택 → 예약.
 * room/layout 은 페이지가 prefetch. 가용성은 시간이 바뀔 때마다 새 키로 조회(15초 stale).
 */
export function RoomReservation({ roomId }: { roomId: string }) {
  const { data: room } = useSuspenseQuery(roomQueries.detail(roomId));
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  const [range, setRange] = useState<TimeRange>(() => defaultTimeRange());
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

  const iso = toIsoRange(range);
  const availability = useQuery({
    ...roomQueries.availability(roomId, iso?.startAt ?? "", iso?.endAt ?? ""),
    enabled: iso !== null,
  });

  const seats = useMemo(
    () => layout.objects.filter((o): o is SeatObjectDto => o.type === "seat"),
    [layout.objects],
  );
  const occupied = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const o of availability.data?.occupied ?? []) map.set(o.seatId, o.mine);
    return map;
  }, [availability.data]);

  const seatStatusOf = (seatId: string): SeatAvailability => {
    const seat = seats.find((s) => s.seat.id === seatId);
    if (!seat || seat.seat.status === "disabled") return "disabled";
    const mine = occupied.get(seatId);
    if (mine === undefined) return "available";
    return mine ? "mine" : "reserved";
  };

  const selectedSeat = seats.find((s) => s.seat.id === selectedSeatId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">{room.description || "설명 없음"}</p>
      </div>

      <TimeRangePicker
        value={range}
        onChange={(next) => {
          setRange(next);
          setSelectedSeatId(null); // 시간이 바뀌면 이전 선택은 무효
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <RoomMap
            layout={layout}
            seatStatusOf={seatStatusOf}
            selectedSeatId={selectedSeatId}
            onSelectSeat={setSelectedSeatId}
          />
          {availability.isFetching ? (
            <span className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-xs text-zinc-500">
              가용성 확인 중...
            </span>
          ) : null}
        </div>
        <ReservePanel
          roomId={roomId}
          seat={selectedSeat}
          range={range}
          onReserved={() => setSelectedSeatId(null)}
        />
      </div>
    </div>
  );
}
```

`src/widgets/room-reservation/index.ts`
```ts
export { RoomReservation } from "./ui/room-reservation";
```

`src/app/(user)/rooms/[roomId]/page.tsx` (전체 교체)
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomReservation } from "@/widgets/room-reservation";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function RoomDetailPage({ params }: Props) {
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
      <RoomReservation roomId={roomId} />
    </HydrationBoundary>
  );
}
```

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 브라우저 확인**

1. `/rooms/<id>`: 날짜 = 오늘(KST), 시작 = 다음 슬롯, 종료 = +1h. 배치도에 좌석 색.
2. 좌석 클릭 → 우측 패널에 이름·시간 → 예약하기 → "예약되었습니다", 그 좌석이 초록(mine)으로.
3. 시간을 겹치게 바꾸면 여전히 초록, 안 겹치게 바꾸면 파랑.
4. 충돌: 다른 계정(또는 curl 로 tester 가 아닌 계정)이 같은 좌석·시간을 먼저 예약 → 이 화면에서 예약하기 → "방금 다른 사용자가 예약했습니다" + 좌석이 빨강으로 갱신.
5. 400px 폭: 배치도가 폭에 맞고 픽커가 세로로 쌓임.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(reservation): 공간 상세 예약 화면 - 시간 선택 → 가용성 → 좌석 선택 → 예약"
```

---

### Task 6: 내 예약 페이지 + 관리자 예약 현황

**Files:**
- Create: `src/widgets/my-reservations/ui/my-reservations.tsx`, `index.ts`
- Create: `src/widgets/admin-reservations/ui/admin-reservations.tsx`, `index.ts`
- Create: `src/app/(user)/reservations/page.tsx`
- Create: `src/app/(admin)/admin/reservations/page.tsx`

- [ ] **Step 1: 구현**

`src/widgets/my-reservations/ui/my-reservations.tsx`
```tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ReservationCard, reservationQueries } from "@/entities/reservation";
import { CancelReservationButton } from "@/features/reservation-cancel";

/** 다가오는 예약(reserved, 시작 전) 과 지난/취소 예약을 나눠 보여준다 */
export function MyReservations() {
  const { data } = useSuspenseQuery(reservationQueries.mine());
  const now = Date.now();
  const upcoming = data.filter(
    (r) => r.status === "reserved" && new Date(r.startAt).getTime() > now,
  );
  const past = data.filter((r) => !upcoming.includes(r));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold">다가오는 예약</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-600">예정된 예약이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...upcoming].reverse().map((r) => (
              <li key={r.id}>
                <ReservationCard reservation={r} actions={<CancelReservationButton reservation={r} />} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-600">지난 · 취소된 예약</h2>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-500">없음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((r) => (
              <li key={r.id}>
                <ReservationCard reservation={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

`src/widgets/my-reservations/index.ts`
```ts
export { MyReservations } from "./ui/my-reservations";
```

`src/app/(user)/reservations/page.tsx`
```tsx
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
```

`src/widgets/admin-reservations/ui/admin-reservations.tsx`
```tsx
"use client";

import { useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Field, Input } from "@/shared/ui";
import { ReservationCard, reservationQueries, todayKst } from "@/entities/reservation";
import { roomQueries } from "@/entities/room";
import { CancelReservationButton } from "@/features/reservation-cancel";

/** 관리자 현황: 공간·날짜 필터. 취소 버튼은 admin RLS 로 남의 예약도 취소 가능 */
export function AdminReservations() {
  const { data: rooms } = useSuspenseQuery(roomQueries.list());
  const [roomId, setRoomId] = useState<string>("");
  const [date, setDate] = useState<string>(todayKst());
  const query = { roomId: roomId || undefined, date: date || undefined };
  const { data, isFetching } = useQuery(reservationQueries.admin(query));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="공간" htmlFor="adm-room">
          <select
            id="adm-room"
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">전체</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="날짜" htmlFor="adm-date">
          <Input id="adm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {isFetching ? <p className="text-xs text-zinc-500">불러오는 중...</p> : null}
      {data && data.length === 0 ? <p className="text-sm text-zinc-600">예약이 없습니다.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((r) => (
          <li key={r.id}>
            <ReservationCard reservation={r} showUser actions={<CancelReservationButton reservation={r} />} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/widgets/admin-reservations/index.ts`
```ts
export { AdminReservations } from "./ui/admin-reservations";
```

`src/app/(admin)/admin/reservations/page.tsx`
```tsx
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
```

`src/widgets/app-header/ui/app-header.tsx` 의 admin 링크 옆에 추가:
```tsx
          {me.role === "admin" ? (
            <Link href="/admin/reservations" className="text-zinc-700 hover:text-zinc-900">
              예약 현황
            </Link>
          ) : null}
```

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 브라우저 확인 (PRD 20절 사용자 흐름 + 성공 기준 3)**

1. `/reservations`: 방금 만든 예약이 "다가오는 예약" 에, 취소 → confirm → "지난 · 취소된 예약" 으로 이동.
2. 취소 후 `/rooms/<id>` 같은 시간 → 좌석이 파랑으로 돌아옴.
3. `/admin/reservations`: 오늘 날짜 필터, 공간 선택, 사용자 이름 표시. 일반 계정으로 `/api/admin/reservations` → 403.
4. 동시성: 두 계정으로 같은 좌석·시간 POST 를 `curl ... & curl ...` 로 동시에 → 하나 201, 하나 409.

- [ ] **Step 4: 커밋 + 결정 기록**

`docs/decisions.md`:
```
### D-44 · 2026-09-15 · 확정 — 예약 조회는 reservation_details 뷰(security_invoker)
- 좌석명·룸명·사용자명을 매 요청 조인 대신 뷰 하나로. security_invoker 라 RLS 가 그대로 적용돼 일반 사용자는 본인 행만 본다.
- 대안: PostgREST 중첩 select. 타입 추론이 복잡하고 4단 조인이라 뷰가 읽기 쉽다.
```

```bash
git add -A
git commit -m "feat(reservation): 내 예약(취소), 관리자 예약 현황(공간·날짜 필터), 헤더 링크"
```

---

## Self-Review 결과

- 스펙 커버리지: 6절 reservations 4개 + availability ✓(T2), 8절 가용성 staleTime 15s/포커스 refetch ✓(T3), 10절 예약 흐름(시간 → 색 → 클릭 → 201/409 → refetch) ✓(T4, T5), 11절 23P01 매핑 ✓(Plan A 의 mapPostgresError 재사용), PRD 12 ✓, 부록(30분, 09~22, 과거 불가, 날짜/시간 먼저, 남의 예약 비노출) ✓(T1, T2, T5), PRD 17 "예약 시간 충돌 검사" 단위 테스트 ✓(overlap.test), PRD 15 모바일 우선(viewBox fit, 세로 스택) ✓(T3, T5), 성공 기준 3(동시 요청 하나만 성공) ✓(T6 Step 3-4).
- 타입 일관성: `TimeRange` (T4 정의 → T5 사용), `seatStatusOf(seatId)` (T3 RoomMap props → T5), `reservationQueries.admin(query)` (T3 → T6), `ReservationDto.userName` (T1 → T2 mapper → T3 card `showUser`).
- 남은 위험: (1) 뷰 컬럼 nullable 추론 — `req()` 로 흡수. (2) `date` input 의 브라우저 로케일 표시는 다르지만 값은 항상 YYYY-MM-DD. (3) `roomKeys.availability(roomId,"","").slice(0,3)` 접두 무효화는 키 구조에 의존 — `roomKeys` 를 바꾸면 같이 수정.
