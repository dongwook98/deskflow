# DeskFlow MVP 설계

작성: 2026-09-14. 기준 문서: `PRD.md`(원문 + 부록). 이 문서는 "어떻게 만들 것인가"를 정의한다. 요구사항 자체는 PRD 를 따른다.

## 1. 목표와 제약

- 목표: PRD 20절 MVP 완료 기준을 2일 안에 충족. 포트폴리오 질문(PRD 21절) 12개 중 10번(모바일 Editor) 제외 전부 코드로 답할 수 있어야 한다.
- 제약: 1인 개발, 2일. 모바일 Editor, E2E, shadcn, RHF, dnd-kit, Realtime 제외(PRD 부록).
- 성공 기준:
  1. 관리자가 좌석 20개 배치도를 만들고 저장 후 새로고침해도 동일하게 복원된다.
  2. Undo/Redo 가 추가·삭제·이동·회전·속성 수정 전부에 동작하고, 드래그 1회가 1단계다.
  3. 같은 좌석·겹치는 시간에 두 예약을 넣으면 두 번째가 DB 에서 거부되고 클라이언트는 409 를 받는다.
  4. 일반 사용자가 `/api/rooms` 에 POST 하면 403.
  5. `pnpm typecheck && pnpm lint && pnpm test` 통과, Vercel 배포 URL 동작.

## 2. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router, React 19, TypeScript strict + `noUncheckedIndexedAccess` | `middleware.ts` 아님, `proxy.ts` |
| 스타일 | Tailwind CSS v4 | 컴포넌트 라이브러리 없음 |
| 에디터 상태 | Zustand 5 (vanilla store + Context) | 인스턴스별 스토어 |
| 서버 상태 | TanStack Query 5, 서버 prefetch + HydrationBoundary | 기본 staleTime 60s |
| 서버 | Next Route Handler (`src/app/api/**`) | Server Action 미사용 |
| DB / Auth | Supabase Postgres + Auth, RLS, `@supabase/ssr` | Realtime 미사용 |
| 검증 | Zod 4 | 계약 스키마를 서버·클라 공유 |
| 테스트 | Vitest | 순수 로직 + Route Handler 단위 |
| 배포 | Vercel + Supabase 호스팅 | |

## 3. 아키텍처 개요

```
┌──────────────────────── 브라우저 ────────────────────────┐
│  app/(pages)  →  widgets  →  features  →  entities  →  shared │
│                                  │                            │
│              Zustand Editor Store│   TanStack Query 캐시      │
│                                  │        │ apiFetch          │
└──────────────────────────────────┼────────┼───────────────────┘
                                   │        │ HTTP /api/*
┌──────────────────────── Next 서버 ───────┼───────────────────┐
│  RSC page.tsx: prefetchQuery(/api/*, cookie 전달) → dehydrate  │
│  app/api/**/route.ts (얇음)                                    │
│        └→ app/api/_server/** (서비스, 인증, 검증, DB 클라이언트) │
│                 └→ Supabase (RLS 가 최종 방어)                  │
│  proxy.ts: 세션 쿠키 갱신 + 미로그인 리다이렉트                  │
└───────────────────────────────────────────────────────────────┘
```

원칙:
1. 프론트 레이어(widgets/features/entities)는 Supabase 를 모른다. HTTP 와 `shared/contracts` 만 안다.
2. 백엔드는 `app/api/_server` 안에 모인다. 이 폴더만 Supabase 를 안다. ESLint 가 프론트 → `_server` import 를 막는다.
3. 서버 상태(TanStack Query)와 편집 상태(Zustand)의 접점은 세 번뿐: 로드 1회, 저장 1회, 충돌 시 교체 1회.

## 4. 폴더 구조

```
src/
  proxy.ts                         세션 갱신, 미로그인 → /login
  app/
    layout.tsx                     QueryProvider 감쌈
    (public)/login/page.tsx
    (user)/rooms/page.tsx          (user)/rooms/[roomId]/page.tsx   (user)/reservations/page.tsx
    (admin)/admin/rooms/...        new, [roomId], [roomId]/editor   (admin)/admin/reservations/page.tsx
    api/
      _server/                     ← 백엔드. 라우팅 제외(_ 접두)
        db/supabase.ts             createServerSupabase(): 요청 쿠키 기반
        db/database.types.ts
        http/response.ts           ok(data, init?) / fail(code, message, status)
        http/auth.ts               requireUser() / requireAdmin()
        http/validate.ts           parseBody(req, schema) / parseQuery(req, schema)
        http/errors.ts             ApiHttpError, mapPostgresError(23P01 → 409 ...)
        auth/auth.service.ts
        rooms/rooms.service.ts
        rooms/layout.service.ts
        reservations/reservations.service.ts
        reservations/availability.service.ts
        users/profile.service.ts
      auth/{login,signup,logout,me}/route.ts
      rooms/route.ts
      rooms/[roomId]/route.ts
      rooms/[roomId]/layout/route.ts
      rooms/[roomId]/availability/route.ts
      reservations/route.ts
      reservations/[reservationId]/cancel/route.ts
      admin/reservations/route.ts
  widgets/
    room-editor/                   EditorShell(Header+Toolbar+Canvas+Panel 조립)
    room-viewer/                   예약용 읽기 전용 배치도
    reservation-form/
  features/
    room-editor/                   model/(types, store, selectors, provider) lib/(geometry, history, document) ui/(canvas, toolbar, properties-panel, hooks)
    room-manage/                   create/update/delete mutation hooks + 폼
    reservation-create/
    reservation-cancel/
    auth/                          login/signup/logout mutation hooks + 폼
  entities/
    room/                          model/query-keys.ts  api/queries.ts(queryOptions)  ui/RoomCard
    reservation/                   model/query-keys.ts  api/queries.ts  lib/overlap.ts(+test)  lib/time-slots.ts
    user/                          api/queries.ts(me)
  shared/
    contracts/                     room.ts reservation.ts auth.ts error.ts   ← 서버·클라 공유 DTO + zod
    api/http.ts                    apiFetch<T>(path, init?, ctx?) , ApiError
    api/query-client.ts            makeQueryClient / getQueryClient
    api/query-provider.tsx
    api/server-fetch-context.ts    (server-only) origin + cookie 헤더
    config/site.ts                 getSiteOrigin()
    lib/                           cn, date 포맷 등 소형 유틸
    ui/                            Button, Input, Dialog 등 최소 프리미티브
supabase/migrations/0001_init.sql
docs/
```

ESLint boundaries 요소: `shared`, `entities`, `features`, `widgets`, `app`, `server`(= `src/app/api/_server/**`), `proxy`.
허용: `server → shared`, `app → widgets|features|entities|shared|server`(단 `app/api/**/route.ts` 만 server 접근), 나머지 FSD 기본.

## 5. 데이터 모델 (`0001_init.sql`)

```
profiles       id uuid PK → auth.users, name text, role user_role('user'|'admin') default 'user', created_at
rooms          id, name, description, width int, height int, layout_version int default 0,
               created_by → profiles, created_at, updated_at
space_objects  id, room_id → rooms (cascade), type object_type('seat'|'table'|'wall'),
               x, y, width, height float8, rotation float8 default 0, z_index int default 0, created_at, updated_at
seats          id, space_object_id → space_objects (cascade, UNIQUE), name text, status seat_status('available'|'disabled')
reservations   id, user_id → profiles, seat_id → seats, start_at, end_at timestamptz,
               status reservation_status('reserved'|'cancelled'), created_at, cancelled_at
               CHECK (start_at < end_at)
               EXCLUDE USING gist (seat_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status = 'reserved')
```

함수/트리거:
- `handle_new_user()`: auth.users insert → profiles 생성 (name = metadata.name 또는 이메일 local part).
- `is_admin()` security definer.
- `set_updated_at()`.
- `save_room_layout(p_room_id, p_expected_version, p_objects jsonb) returns int`: `rooms` 행 잠금 → 버전 비교(불일치 시 `raise exception 'version_conflict'`) → 문서에 없는 space_objects 삭제 → space_objects upsert → seats upsert(type='seat' 인 것만) → `layout_version + 1` 반환.
- `get_seat_availability(p_room_id, p_start, p_end) returns table(seat_id, mine bool)` security definer: 겹치는 reserved 예약의 seat_id 만 노출.

RLS:
- profiles: 본인 read/update(role 변경 불가), admin 전체 read.
- rooms / space_objects / seats: 인증 사용자 read, admin 만 write.
- reservations: 본인 read/insert(`user_id = auth.uid()`, `start_at > now()`)/update(status 만), admin 전체 read/update.

## 6. API 명세

공통:
- 성공: `200/201` 에 `T` 를 봉투 없이 반환. 실패: `4xx/5xx` 에 `{ error: { code, message } }`. 코드는 `shared/contracts/error.ts` 의 유니온. (`apiFetch` 는 `!res.ok` 면 `ApiError` throw)
- 인증 없음 401 `unauthorized`, 권한 없음 403 `forbidden`, 검증 실패 400 `invalid_input`, 없음 404 `not_found`, 충돌 409 `version_conflict` | `reservation_overlap`.
- Route Handler 는 10~15줄: `requireUser/Admin → parse → service → ok`. 예외는 `withErrorHandling` 래퍼가 `ApiHttpError → 응답`, 그 외 500.

| Method | Path | Auth | Body / Query | 응답 |
|---|---|---|---|---|
| POST | /api/auth/signup | - | `{ email, password, name }` | `{ user: MeDto }` |
| POST | /api/auth/login | - | `{ email, password }` | `{ user: MeDto }` (Set-Cookie) |
| POST | /api/auth/logout | user | - | `{}` |
| GET | /api/auth/me | user | - | `MeDto` `{ id, name, role }` |
| GET | /api/rooms | user | - | `RoomDto[]` |
| POST | /api/rooms | admin | `{ name, description?, width, height }` | `RoomDto` 201 |
| GET | /api/rooms/:roomId | user | - | `RoomDto` |
| PATCH | /api/rooms/:roomId | admin | 부분 `{ name?, description?, width?, height? }` | `RoomDto` |
| DELETE | /api/rooms/:roomId | admin | - | `{}` |
| GET | /api/rooms/:roomId/layout | user | - | `LayoutDto { roomId, width, height, layoutVersion, objects: SpaceObjectDto[] }` |
| PUT | /api/rooms/:roomId/layout | admin | `{ expectedVersion, objects: SpaceObjectInput[] }` | `{ layoutVersion }` / 409 |
| GET | /api/rooms/:roomId/availability?start=&end= | user | ISO | `{ occupied: [{ seatId, mine }] }` |
| GET | /api/reservations | user | - | `ReservationDto[]` (본인, 좌석·룸 이름 포함) |
| POST | /api/reservations | user | `{ seatId, startAt, endAt }` | `ReservationDto` 201 / 409 |
| POST | /api/reservations/:id/cancel | user(본인) / admin | - | `ReservationDto` (상태 전이는 동사 서브리소스) |
| GET | /api/admin/reservations | admin | `?roomId&date` | `ReservationDto[]` |

## 7. 계약 (`shared/contracts`)

```ts
// room.ts
export type ObjectType = "seat" | "table" | "wall";
export interface SpaceObjectBaseDto { id; roomId; type; x; y; width; height; rotation; zIndex }
export interface SeatObjectDto extends SpaceObjectBaseDto { type: "seat"; seat: { id: string; name: string; status: "available" | "disabled" } }
export interface TableObjectDto extends SpaceObjectBaseDto { type: "table" }
export interface WallObjectDto extends SpaceObjectBaseDto { type: "wall" }
export type SpaceObjectDto = SeatObjectDto | TableObjectDto | WallObjectDto;
export interface RoomDto { id; name; description; width; height; layoutVersion; createdAt; updatedAt }
export interface LayoutDto { roomId; width; height; layoutVersion; objects: SpaceObjectDto[] }
export const createRoomSchema, updateRoomSchema, saveLayoutSchema (zod). SpaceObjectInput = z.infer<...>
```
- DTO 는 camelCase, 날짜는 ISO 문자열. 변환은 `_server` 서비스에서 끝낸다.
- 프론트 도메인 타입 = DTO 그대로 사용. 조회/CRUD 화면에는 별도 매핑 계층을 두지 않는다. 이유: DTO 를 우리가 설계하므로 이미 UI 친화적(camelCase, ISO 날짜, 판별 유니온). 매핑 계층은 API 모양이 UI 와 어긋날 때 도입한다. 도입 지점은 `entities/*/api/queries.ts` 의 `select` 옵션 한 곳(모든 조회가 여기를 지남).
- 예외: 에디터. `EditorDocument` 가 편집용 도메인 모델이고 `features/room-editor/lib/document.ts` 의 `fromLayoutDto / toSaveInput` 이 매핑이다. 정규화(Record + order)와 불변 갱신이 필요해서 DTO 배열을 그대로 쓰지 않는다.

## 8. 서버 상태 (TanStack Query)

- `makeQueryClient()`: `defaultOptions.queries.staleTime = 60_000`. 서버는 `React.cache()` 로 요청당 1개, 브라우저는 모듈 싱글톤.
- 예외: 가용성 쿼리는 `staleTime: 15_000`, `refetchOnWindowFocus: true` 로 덮어쓴다. 다른 사용자의 예약이 곧 반영돼야 한다.
- queryKey 는 `entities/*/model/query-keys.ts` 에 팩토리로: `roomKeys.all / list() / detail(id) / layout(id) / availability(id, start, end)`, `reservationKeys.mine() / admin(filters)`, `authKeys.me()`.
- `queryOptions` 팩토리는 `ctx?: ServerFetchContext` 를 받는다. queryFn 은 하나: `apiFetch(path, undefined, ctx)`.
- **대안 B 채택**: 서버 prefetch 도 `/api` 를 호출한다.
  ```ts
  // page.tsx (RSC)
  const ctx = await serverFetchContext();            // { origin, cookie }
  const qc = getQueryClient();
  await qc.prefetchQuery(roomQueries.layout(roomId, ctx));
  return <HydrationBoundary state={dehydrate(qc)}><EditorPage roomId={roomId} /></HydrationBoundary>;
  // 클라이언트
  const { data } = useSuspenseQuery(roomQueries.layout(roomId));   // ctx 없음, 상대경로
  ```
- `apiFetch`: `ctx` 가 있으면 `${ctx.origin}${path}` + `cookie` 헤더, 없으면 상대경로 + `credentials: 'same-origin'`. 실패 시 `ApiError(status, code, message)` throw.
- `getSiteOrigin()`: `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `http://localhost:3000`. Vercel 프리뷰는 `NEXT_PUBLIC_SITE_URL` 을 프리뷰 URL 로 두거나 Deployment Protection 을 끈다.
- mutation: `useMutation({ mutationFn: apiFetch POST/PUT/PATCH/DELETE, onSuccess: invalidateQueries(관련 키) })`. 낙관적 업데이트 없음.
- 캐시 무효화 표:
  | mutation | invalidate |
  |---|---|
  | room create/update/delete | `roomKeys.all` |
  | layout save | `roomKeys.layout(id)`, `roomKeys.detail(id)` |
  | reservation create/cancel | `reservationKeys.mine()`, `roomKeys.availability(...)` |
  | login/logout | `authKeys.me()` + `router.refresh()` |

## 9. 에디터 상태 (Zustand)

문서(불변, 히스토리·Dirty 단위):
```ts
interface EditorDocument { roomId; width; height; objects: Readonly<Record<string, SpaceObjectDto>>; order: readonly string[] }  // order = z 순서, 저장 시 index → zIndex
```
상태:
```ts
document, history: { past: EditorDocument[]; future: EditorDocument[] }, gestureSnapshot: EditorDocument | null,
selectedObjectId: string | null,
viewport: { zoom: 0.5|0.75|1|1.25|1.5; offsetX; offsetY },
tool: { type: "select" } | { type: "place"; objectType },
interaction: { type: "idle" } | { type: "drag"; id; startPointer; startPosition } | { type: "pan"; lastPointer },
persistence: { savedDocument; inFlightDocument: EditorDocument | null; layoutVersion; status: "idle"|"saving"|"error"; error: string | null },
settings: { gridSize: 10; snapToGrid: true }
```
액션:
- 히스토리 1단계: `addObject(type)`(뷰포트 중심), `deleteSelected()`, `rotateSelected(±90)`, `updateSelected(patch)`(이름·상태·위치·크기 숫자 입력).
- 제스처: `beginGesture()` → `moveObject(id, canvasPoint)` × n(스냅+클램프, 히스토리 없음) → `endGesture()`(문서가 바뀌었으면 스냅샷 1개 push).
- `undo()/redo()`: 선택이 삭제된 오브젝트면 해제.
- `select(id|null)`, `setViewport`, `zoomStep(dir, anchorScreenPoint)`, `panBy(dx,dy)`, `setTool`, `setInteraction`. Space 키 눌림은 캔버스 훅의 로컬 ref(스토어 밖). 커서 표시는 `interaction.type === 'pan'` 으로 판단.
- 영속: `saveStarted()`(inFlight = document), `saveSucceeded(version)`(saved = inFlight), `saveFailed(msg)`, `replaceDocument(doc, version)`(충돌 후 교체, 히스토리 초기화).
파생 셀렉터: `isDirty = document !== persistence.savedDocument`, `canUndo`, `canRedo`, `selectedObject`, `orderedObjects`.

순수 로직(`features/room-editor/lib`, 전부 테스트):
- `geometry.ts`: `screenToCanvas / canvasToScreen`, `zoomViewportAt(anchor)`, `ZOOM_STEPS`, `snap`, `clampToRoom`, `normalizeRotation`.
- `history.ts`: `push(limit 100) / undo / redo`.
- `document.ts`: `fromLayoutDto`, `toSaveInput`(order → zIndex), `insert / remove / patch`.

렌더링(`features/room-editor/ui`): `<svg viewBox>` 없이 `<g transform="translate(offset) scale(zoom)">` 하나. 오브젝트는 `<g transform="translate(x y) rotate(r cx cy)">`. 포인터 이벤트는 `onPointerDown` 캡처 후 `setPointerCapture`, `pointermove/up` 은 svg 루트에서. 휠은 `onWheel` + `preventDefault`(passive false 등록).

스토어 생성: `EditorStoreProvider({ initialLayout })` 가 `useState(() => createEditorStore(...))` 로 1회 생성. 부모의 `useSuspenseQuery(roomQueries.layout(id))` 데이터로 초기화. refetch 로 데이터가 바뀌어도 스토어는 반응하지 않는다(의도). 충돌 시에만 `replaceDocument`.

## 10. 핵심 흐름

에디터 저장:
```
저장 클릭 → saveStarted() → PUT /api/rooms/:id/layout { expectedVersion, objects: toSaveInput(document) }
  200 → saveSucceeded(layoutVersion) → invalidate layout/detail
  409 version_conflict → saveFailed() + 다이얼로그 "다른 곳에서 저장됨. 서버 버전 불러오기 / 계속 편집"
        불러오기 → refetch layout → replaceDocument(fromLayoutDto(data), data.layoutVersion)
  기타 → saveFailed(message), 편집 상태 유지, 재시도 버튼
```
이탈 경고: `isDirty` 이면 `beforeunload` 등록 + 앱 내 링크는 확인 다이얼로그.

예약:
```
/rooms/:id → 날짜(오늘~+14일) + 시작/종료(30분 단위, 09:00~22:00) 선택
  → useQuery(availability(id, start, end)) → 뷰어가 좌석 색: 비활성 / 예약됨 / 내 예약 / 가능
  → 가능한 좌석 클릭 → 확인 → POST /api/reservations
      201 → invalidate mine + availability, 토스트
      409 reservation_overlap → "방금 다른 사용자가 예약했습니다" + availability refetch
```
서버는 `overlap` 을 미리 검사하지 않는다. insert 후 Postgres `23P01` 을 409 로 매핑. 클라이언트 `overlap.ts` 는 UI 표시 전용.

인증:
```
/login → POST /api/auth/login → 서버 supabase.signInWithPassword → Set-Cookie → invalidate me → router.push(next)
proxy.ts → 모든 요청에서 세션 갱신, 미로그인 + 비공개 경로 → /login?next=
(admin) 레이아웃 → GET /api/auth/me prefetch, role !== 'admin' 이면 403 페이지. RLS 가 최종 방어.
```

## 11. 에러 처리

- 서버: 서비스는 `ApiHttpError(status, code, message)` throw. `withErrorHandling(handler)` 가 응답 변환. Postgres 코드 매핑: `23P01 → 409 reservation_overlap`, `version_conflict 메시지 → 409 version_conflict`, `42501 → 403`, `PGRST116(0 rows) → 404`.
- 클라이언트: `ApiError` 를 mutation `onError` 에서 코드별 분기. 공통 토스트 1개(`shared/ui/toast`). 페이지 단위 `error.tsx`, `loading.tsx` 기본 구현.
- env 검증은 사용하는 함수 안에서 lazy. 누락 시 메시지에 키 이름 포함. 모듈 import 시점 parse 금지.

## 12. 테스트 (Vitest)

- `features/room-editor/lib/*.test.ts`: 좌표 왕복, 줌 앵커 고정, 스냅/클램프, 히스토리 push/undo/redo/limit, 문서 직렬화(zIndex).
- `features/room-editor/model/store.test.ts`: 드래그 1회 = 1단계, undo 후 dirty=false, 저장 중 편집 보존, 회전 wrap, replaceDocument 초기화.
- `entities/reservation/lib/overlap.test.ts`, `time-slots.test.ts`.
- `app/api/_server/**/*.test.ts`: 서비스 함수는 Supabase 클라이언트를 인자로 받아 목 주입. 검증·에러 매핑 테스트.
- 통합 1개(선택, Supabase 연결 시): 같은 좌석 겹침 insert 두 번 → 두 번째 23P01.

## 13. 구현 순서 (2일)

Day 1
1. 기반: 의존성, 설정, `shared/api`, `contracts`, `_server/http`, `_server/db`, `proxy.ts`, 마이그레이션 SQL → Supabase CLI(`supabase link` + `supabase db push`)로 적용. CLI 미설치 시 SQL Editor 에 붙여넣기
2. Auth: `/api/auth/*`, 로그인/회원가입 페이지, admin 가드
3. Room CRUD: API + `/admin/rooms`, `/admin/rooms/new`, `/rooms`, `/rooms/:id` 뼈대
4. 에디터 상태: 스토어 + 순수 로직 + 테스트
5. 에디터 UI: 캔버스, 추가/선택/드래그/회전/삭제, Properties Panel, 저장(PUT layout)

Day 2
6. Undo/Redo, Zoom/Pan, Dirty + 이탈 경고, 키보드
7. 예약: availability API, 뷰어, 날짜/시간 선택, 생성/취소, 내 예약, 관리자 현황
8. 로딩/에러 기본, 반응형(예약 화면)
9. 배포(Vercel env, Supabase URL 설정), README(구조·결정·트러블슈팅·질문 답). `docs/decisions.md` 는 각 단계마다 한 줄씩 누적해 두고 README 는 이를 정리만 한다

각 단계 끝: `pnpm typecheck && pnpm lint && pnpm test` 후 결과 보고, 다음 단계 제안 → 컨펌.

## 14. 결정 기록

| 결정 | 이유 | 대안 |
|---|---|---|
| Route Handler + `_server` 폴더, Server Action 미사용 | HTTP 계약 명시, 테스트 용이, 백엔드 교체 지점 명확 | Server Action(코드 적지만 불투명) |
| 서버 prefetch 도 `/api` 호출(B) | queryFn 한 벌, 프론트가 Supabase 를 전혀 모름 | RSC 가 서비스 직접 호출(A, HTTP 절약) |
| `seats` 테이블 분리 | 예약 FK 가 좌석만 가리킴, 좌석 속성 확장 자유 | 단일 테이블 + nullable |
| SVG 렌더링 | 요소 단위 이벤트, transform 으로 회전·줌, 수백 개까지 충분 | Canvas 2D(대량 시 전환 가능하도록 문서 모델 분리) |
| Pointer Events 직접 | 좌표 변환을 직접 소유, dnd-kit 은 캔버스용 아님 | dnd-kit |
| 스냅샷 히스토리 | 구현 단순, 문서 크기 작음, 상한 100 | 커맨드 패턴 |
| Dirty = 참조 비교 | Undo 로 저장 상태 복귀 시 자동 clean | boolean 플래그 |
| 명시적 저장 + layout_version | 편집 중간 상태가 서버에 안 감, 동시 저장 충돌 감지 | Autosave |
| 예약 충돌 = exclusion constraint | 동시 요청도 DB 가 직렬화, 앱 검사 불필요 | select-then-insert(경쟁 조건) |
| TanStack Query 유지, 낙관적 업데이트 없음 | 2일 범위, 충돌 케이스가 많아 서버 응답 기준이 안전 | 낙관적 업데이트 |
