# Plan B: Interactive Space Editor 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `/admin/rooms/:id/editor` 에서 Seat/Table/Wall 을 추가·선택·드래그·회전·삭제하고, Undo/Redo·Zoom/Pan·Dirty 표시·명시적 저장(버전 충돌 감지)까지 되는 에디터.

**Architecture:** 편집 상태는 Zustand 스토어(인스턴스별) 안의 불변 `EditorDocument`. 모든 변경은 새 객체를 만들고, Undo 는 이전 참조 복원, Dirty 는 `document !== savedDocument` 참조 비교. 렌더링은 SVG 한 장(`<g transform="translate scale">`), 입력은 Pointer Events 직접 처리. 서버 상태(TanStack Query)와의 접점은 로드 1회(`fromLayoutDto`), 저장 1회(`toSaveInput` → `PUT /layout`), 충돌 시 교체 1회(`replaceDocument`)뿐.

**Tech Stack:** Zustand 5 (vanilla `createStore` + React Context), TanStack Query 5, SVG, Pointer Events, Zod 4, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md` 6절(layout API), 8절, 9절(에디터 상태), 10절(저장 흐름), 11절. `PRD.md` 4~10절 + 부록 「Editor 세부 확정」. 결정: `docs/decisions.md` D-02, D-06, D-17~D-24, D-31.

## Global Constraints

- Plan A 의 Global Constraints 전부 유지 (TS strict, 레이어 경계, `/api` 만 사용, 한글 주석·테스트명·커밋).
- 에디터 스토어는 전역 싱글톤 금지. `EditorStoreProvider` 가 `useState(() => createEditorStore(...))` 로 1회 생성.
- 문서 변경은 항상 새 객체. 기존 객체 mutate 금지. (Undo/Dirty 가 참조 비교에 의존)
- 드래그 1회 = 히스토리 1단계. `moveObject` 는 히스토리에 쌓지 않고 `beginGesture / endGesture` 가 감싼다.
- 회전은 `0 | 90 | 180 | 270` 만. 오브젝트 중심 기준. width/height 스왑 없음.
- Zoom 단계 `[0.5, 0.75, 1, 1.25, 1.5]`. 휠 1틱 = 1단계, 커서 위치 고정.
- 그리드 스냅 10px. 오브젝트 좌상단은 room 안에 클램프.
- 입력창(input/textarea/select/contentEditable) 포커스 중 Delete/Backspace 는 오브젝트 삭제 금지.
- 저장 실패 시 편집 상태 유지. 409 `version_conflict` 는 "서버 버전 불러오기 / 계속 편집" 선택.
- 각 Task 끝: `pnpm typecheck && pnpm lint && pnpm test` 통과 후 커밋. Task 4 이후는 브라우저 확인 포함.

---

## 파일 구조 (이 계획에서 생성/수정)

```
src/
  app/api/_server/rooms/layout.mapper.ts, layout.mapper.test.ts, layout.service.ts
  app/api/rooms/[roomId]/layout/route.ts
  entities/room/api/queries.ts                     (수정) roomQueries.layout 추가
  features/room-editor/
    model/types.ts                                 EditorDocument, EditorState/Actions, Interaction ...
    model/store.ts, store.test.ts                  createEditorStore
    model/selectors.ts
    model/editor-store-provider.tsx                Provider + useEditorStore / useEditorStoreApi
    lib/geometry.ts, geometry.test.ts              좌표 변환, zoom, snap, clamp, rotate, fit
    lib/history.ts, history.test.ts                push / undo / redo
    lib/document.ts, document.test.ts              DTO ↔ 문서, insert/remove/patch, createObject
    api/mutations.ts                               useSaveLayout
    ui/editor-canvas.tsx                           <svg> + transform + 오브젝트
    ui/space-object-view.tsx                       타입별 도형
    ui/use-canvas-pointer.ts                       선택 / 드래그 / 팬
    ui/use-canvas-wheel.ts                         휠 줌 (non-passive)
    ui/editor-toolbar.tsx                          + Seat / Table / Wall
    ui/properties-panel.tsx                        선택 오브젝트 속성
    ui/history-controls.tsx                        Undo / Redo 버튼
    ui/zoom-controls.tsx                           − % + 맞춤
    ui/save-controls.tsx                           Dirty 표시 + 저장 + 충돌 패널
    ui/use-editor-keyboard.ts                      Delete / Ctrl+Z / Ctrl+Shift+Z
    ui/use-unsaved-changes-guard.ts                beforeunload
    index.ts
  widgets/room-editor/ui/editor-shell.tsx, index.ts     Header + Toolbar + Canvas + Panel 조립
  app/(admin)/admin/rooms/[roomId]/editor/page.tsx, room-editor-page.tsx
```

---

### Task 1: Layout API — GET/PUT /api/rooms/:roomId/layout

**Files:**
- Create: `src/app/api/_server/rooms/layout.mapper.ts`
- Create: `src/app/api/_server/rooms/layout.mapper.test.ts`
- Create: `src/app/api/_server/rooms/layout.service.ts`
- Create: `src/app/api/rooms/[roomId]/layout/route.ts`
- Modify: `src/entities/room/api/queries.ts` (layout 쿼리 추가)

**Interfaces:**
- Consumes: `Tables<"space_objects">`, `Tables<"seats">`, `Json` (database.types), `LayoutDto`, `SpaceObjectDto`, `SaveLayoutInput`, `SaveLayoutResultDto`, `saveLayoutSchema`, `Rotation` (contracts), http 헬퍼(Plan A Task 3), `getRoom`(rooms.service).
- Produces: `toSpaceObjectDto(row: SpaceObjectRowWithSeat): SpaceObjectDto`, `toRotation(n: number): Rotation`, `getLayout(supabase, roomId): Promise<LayoutDto>`, `saveLayout(supabase, roomId, input: SaveLayoutInput): Promise<SaveLayoutResultDto>`, `roomQueries.layout(roomId, ctx?)`.

- [x] **Step 1: 실패하는 테스트** — `src/app/api/_server/rooms/layout.mapper.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toRotation, toSpaceObjectDto } from "./layout.mapper";

const base = {
  id: "o1",
  room_id: "r1",
  x: 10,
  y: 20,
  width: 40,
  height: 40,
  rotation: 90,
  z_index: 3,
  created_at: "2026-09-15T00:00:00+00:00",
  updated_at: "2026-09-15T00:00:00+00:00",
};

describe("toSpaceObjectDto", () => {
  it("seat 행은 seats 조인 결과를 seat 필드로 붙인다", () => {
    const dto = toSpaceObjectDto({
      ...base,
      type: "seat",
      seats: { id: "s1", space_object_id: "o1", name: "A1", status: "disabled" },
    });
    expect(dto).toEqual({
      id: "o1",
      roomId: "r1",
      type: "seat",
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      rotation: 90,
      zIndex: 3,
      seat: { id: "s1", name: "A1", status: "disabled" },
    });
  });

  it("table/wall 행은 seat 필드가 없다", () => {
    const dto = toSpaceObjectDto({ ...base, type: "table", seats: null });
    expect(dto.type).toBe("table");
    expect("seat" in dto).toBe(false);
  });

  it("seat 타입인데 seats 행이 없으면(데이터 불일치) 던진다", () => {
    expect(() => toSpaceObjectDto({ ...base, type: "seat", seats: null })).toThrow(/seat/);
  });
});

describe("toRotation", () => {
  it("0/90/180/270 은 그대로, 그 외 값은 가장 가까운 90° 단위로 정규화한다", () => {
    expect(toRotation(270)).toBe(270);
    expect(toRotation(89)).toBe(90);
    expect(toRotation(-90)).toBe(270);
    expect(toRotation(360)).toBe(0);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/_server/rooms/layout.mapper.test.ts`
Expected: FAIL — `Cannot find module './layout.mapper'`

- [x] **Step 3: 구현**

`src/app/api/_server/rooms/layout.mapper.ts`
```ts
import { ROTATIONS, type Rotation, type SpaceObjectDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

/** `space_objects.select("*, seats(*)")` 의 행. seats 는 unique FK 라 PostgREST 가 객체(1:1)로 돌려준다. */
export type SpaceObjectRowWithSeat = Tables<"space_objects"> & { seats: Tables<"seats"> | null };

/** DB 의 float8 rotation 을 계약의 90° 단위 리터럴로. 잘못 저장된 값도 UI 가 깨지지 않게 정규화. */
export function toRotation(n: number): Rotation {
  const normalized = ((Math.round(n / 90) * 90) % 360) + (n < 0 && n % 360 !== 0 ? 360 : 0);
  const value = ((normalized % 360) + 360) % 360;
  return (ROTATIONS as readonly number[]).includes(value) ? (value as Rotation) : 0;
}

export function toSpaceObjectDto(row: SpaceObjectRowWithSeat): SpaceObjectDto {
  const common = {
    id: row.id,
    roomId: row.room_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: toRotation(row.rotation),
    zIndex: row.z_index,
  };

  switch (row.type) {
    case "seat": {
      if (!row.seats) {
        // save_room_layout 이 항상 seats 를 같이 쓰므로 정상 경로에선 도달하지 않는다
        throw new Error(`seat 오브젝트 ${row.id} 에 seats 행이 없습니다.`);
      }
      return {
        ...common,
        type: "seat",
        seat: { id: row.seats.id, name: row.seats.name, status: row.seats.status },
      };
    }
    case "table":
      return { ...common, type: "table" };
    case "wall":
      return { ...common, type: "wall" };
  }
}
```

`src/app/api/_server/rooms/layout.service.ts`
```ts
import type { LayoutDto, SaveLayoutInput, SaveLayoutResultDto } from "@/shared/contracts";
import type { Json } from "../db/database.types";
import type { ServerSupabase } from "../db/supabase";
import { mapPostgresError } from "../http/errors";
import { toSpaceObjectDto, type SpaceObjectRowWithSeat } from "./layout.mapper";
import { getRoom } from "./rooms.service";

/** room 메타 + 오브젝트 전체. 에디터와 뷰어의 초기 문서. */
export async function getLayout(supabase: ServerSupabase, roomId: string): Promise<LayoutDto> {
  const room = await getRoom(supabase, roomId); // 없으면 404
  const { data, error } = await supabase
    .from("space_objects")
    .select("*, seats(*)")
    .eq("room_id", roomId)
    .order("z_index");
  if (error) throw mapPostgresError(error);

  return {
    roomId: room.id,
    width: room.width,
    height: room.height,
    layoutVersion: room.layoutVersion,
    objects: (data as SpaceObjectRowWithSeat[]).map(toSpaceObjectDto),
  };
}

/**
 * 레이아웃 전체 저장. DB 함수 save_room_layout 이 한 트랜잭션으로
 * 삭제(문서에 없는 것) → space_objects upsert → seats upsert → layout_version+1 을 수행한다.
 * p_objects 는 계약 DTO 모양(camelCase) 그대로. SQL 쪽이 그 키를 읽는다.
 * 버전 불일치는 P0001 'version_conflict' → 409, 예약 있는 좌석 삭제는 23503 → 409.
 */
export async function saveLayout(
  supabase: ServerSupabase,
  roomId: string,
  input: SaveLayoutInput,
): Promise<SaveLayoutResultDto> {
  const { data, error } = await supabase.rpc("save_room_layout", {
    p_room_id: roomId,
    p_expected_version: input.expectedVersion,
    p_objects: input.objects as unknown as Json,
  });
  if (error) throw mapPostgresError(error);
  return { layoutVersion: data };
}
```

`src/app/api/rooms/[roomId]/layout/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { getLayout, saveLayout } from "@/app/api/_server/rooms/layout.service";
import { saveLayoutSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ roomId: string }> };

/** GET /api/rooms/:roomId/layout — 로그인 사용자. 에디터·뷰어 공용 */
export const GET = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await getLayout(supabase, roomId));
});

/** PUT /api/rooms/:roomId/layout — admin. body: { expectedVersion, objects }. 409 on conflict */
export const PUT = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const input = await parseBody(req, saveLayoutSchema);
  return ok(await saveLayout(supabase, roomId, input));
});
```

`src/entities/room/api/queries.ts` — `roomQueries` 객체에 추가:
```ts
  layout: (roomId: string, ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: roomKeys.layout(roomId),
      queryFn: () => apiFetch<LayoutDto>(`/api/rooms/${roomId}/layout`, undefined, ctx),
    }),
```
import 에 `LayoutDto` 추가: `import type { LayoutDto, RoomDto } from "@/shared/contracts";`

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 테스트 33개 통과

- [x] **Step 5: 동작 확인** (dev :3000, admin 쿠키 jar `$J` 는 Plan A 와 동일)

```bash
R=<1층 오피스 room id>
curl -s -b $J http://localhost:3000/api/rooms/$R/layout; echo
curl -s -b $J -X PUT -H 'Content-Type: application/json' http://localhost:3000/api/rooms/$R/layout -d '{
  "expectedVersion": 0,
  "objects": [
    {"id":"11111111-1111-4111-8111-111111111111","type":"seat","x":100,"y":100,"width":40,"height":40,"rotation":0,"zIndex":0,
     "seat":{"id":"22222222-2222-4222-8222-222222222222","name":"A1","status":"available"}},
    {"id":"33333333-3333-4333-8333-333333333333","type":"table","x":200,"y":100,"width":120,"height":60,"rotation":90,"zIndex":1}
  ]}'; echo
curl -s -b $J -X PUT -H 'Content-Type: application/json' http://localhost:3000/api/rooms/$R/layout -d '{"expectedVersion":0,"objects":[]}'; echo
curl -s -b $J http://localhost:3000/api/rooms/$R/layout | python3 -m json.tool | head -30
```
Expected: 1) `objects: []`, `layoutVersion: 0` 2) `{"layoutVersion":1}` 3) `{"error":{"code":"version_conflict",...}}` 409 4) 오브젝트 2개, seat 에 `seat.name = "A1"`.

- [x] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(api): 레이아웃 조회/저장 엔드포인트 - save_room_layout RPC, 버전 충돌 409"
```

---

### Task 2: 에디터 순수 로직 — geometry, history, document

**Files:**
- Create: `src/features/room-editor/model/types.ts`
- Create: `src/features/room-editor/lib/geometry.ts`, `geometry.test.ts`
- Create: `src/features/room-editor/lib/history.ts`, `history.test.ts`
- Create: `src/features/room-editor/lib/document.ts`, `document.test.ts`

**Interfaces:**
- Consumes: `LayoutDto`, `SpaceObjectDto`, `SaveLayoutInput`, `SpaceObjectInput`, `ObjectType`, `Rotation`, `ROTATIONS`, `SeatStatus` (contracts).
- Produces (types.ts): `Point`, `Size`, `EditorDocument`, `EditorHistory`, `Viewport`, `Interaction`, `SaveStatus`, `PersistenceState`, `EditorSettings`, `ObjectPatch`, `EditorState`, `EditorActions`, `EditorStore`.
- Produces (geometry.ts): `ZOOM_STEPS`, `stepZoom(current, direction): number`, `screenToCanvas(p, v): Point`, `canvasToScreen(p, v): Point`, `zoomViewportAt(v, anchorScreen, nextZoom): Viewport`, `snap(value, grid): number`, `snapPoint(p, grid): Point`, `clampToRoom(pos, size, room): Point`, `rotateBy(rotation, direction): Rotation`, `fitViewport(room, viewportSize, padding?): Viewport`.
- Produces (history.ts): `HISTORY_LIMIT`, `emptyHistory`, `pushHistory(h, snapshot, limit?)`, `undoHistory(h, current)`, `redoHistory(h, current)`.
- Produces (document.ts): `DEFAULT_OBJECT_SIZE`, `fromLayoutDto(layout): EditorDocument`, `toSaveInput(doc, expectedVersion): SaveLayoutInput`, `orderedObjects(doc): SpaceObjectDto[]`, `insertObject(doc, obj)`, `removeObject(doc, id)`, `patchObject(doc, id, patch: ObjectPatch)`, `createObject(args): SpaceObjectDto`, `nextSeatName(doc): string`.

- [x] **Step 1: 타입 정의** — `src/features/room-editor/model/types.ts`

```ts
import type {
  LayoutDto,
  ObjectType,
  Rotation,
  SeatStatus,
  SpaceObjectDto,
} from "@/shared/contracts";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * 에디터가 편집하는 문서. Undo/Redo 와 Dirty 판단의 단위.
 * 불변으로 취급한다: 변경은 항상 새 객체. 같은 참조 = 같은 상태.
 * objects 는 id 조회 O(1), order 는 아래→위 z 순서 (저장 시 인덱스가 zIndex).
 */
export interface EditorDocument {
  roomId: string;
  width: number;
  height: number;
  objects: Readonly<Record<string, SpaceObjectDto>>;
  order: readonly string[];
}

export interface EditorHistory {
  past: readonly EditorDocument[];
  future: readonly EditorDocument[];
}

/** screen = canvas * zoom + offset */
export interface Viewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** 진행 중인 포인터 제스처. 히스토리 대상 아님. */
export type Interaction =
  | { type: "idle" }
  /** grabOffset: 포인터가 오브젝트 좌상단에서 얼마나 떨어진 곳을 잡았는지(캔버스 좌표). 드래그 중 점프 방지 */
  | { type: "drag"; id: string; grabOffset: Point }
  | { type: "pan"; lastScreen: Point };

export type SaveStatus = "idle" | "saving" | "error" | "conflict";

export interface PersistenceState {
  /** 마지막으로 서버에 저장된 문서. document !== savedDocument 이면 dirty */
  savedDocument: EditorDocument;
  /** 저장 요청 시점의 문서. 성공 시 이것이 savedDocument 가 된다 (저장 중 편집 보존) */
  inFlightDocument: EditorDocument | null;
  /** 서버 rooms.layout_version. PUT 의 expectedVersion */
  layoutVersion: number;
  status: SaveStatus;
  error: string | null;
}

export interface EditorSettings {
  gridSize: number;
  snapToGrid: boolean;
}

/** Properties Panel 이 보내는 부분 수정. seat* 는 seat 타입에만 적용된다. */
export interface ObjectPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: Rotation;
  seatName?: string;
  seatStatus?: SeatStatus;
}

export interface EditorState {
  document: EditorDocument;
  history: EditorHistory;
  /** 제스처 시작 시점 문서. endGesture 에서 히스토리로 이동 */
  gestureSnapshot: EditorDocument | null;
  selectedObjectId: string | null;
  viewport: Viewport;
  /** 캔버스 DOM 크기(px). 새 오브젝트 위치(뷰포트 중심)와 fit 계산에 필요 */
  viewportSize: Size;
  interaction: Interaction;
  persistence: PersistenceState;
  settings: EditorSettings;
}

export interface EditorActions {
  // --- 문서: 각 호출이 히스토리 1단계 ---
  addObject(type: ObjectType): string;
  deleteSelected(): void;
  rotateSelected(direction: 1 | -1): void;
  updateSelected(patch: ObjectPatch): void;

  // --- 문서: 제스처 내부 연속 변경. 히스토리에 쌓지 않음 ---
  moveObject(id: string, topLeft: Point): void;
  beginGesture(): void;
  endGesture(): void;

  // --- 히스토리 ---
  undo(): void;
  redo(): void;

  // --- 선택 ---
  select(id: string | null): void;

  // --- 뷰포트 ---
  setViewport(patch: Partial<Viewport>): void;
  zoomStep(direction: 1 | -1, anchorScreen?: Point): void;
  panBy(dx: number, dy: number): void;
  /** 캔버스 크기 보고. 최초 보고 시 room 이 화면에 맞도록 fit 한다 */
  setViewportSize(size: Size): void;
  fitToScreen(): void;

  setInteraction(interaction: Interaction): void;

  // --- 영속: 네트워크는 api/mutations 가. 여기는 상태 전이만 ---
  saveStarted(): void;
  saveSucceeded(layoutVersion: number): void;
  saveFailed(message: string, status?: "error" | "conflict"): void;
  dismissSaveError(): void;
  /** 충돌 후 서버 문서로 교체. 히스토리·선택 초기화 */
  replaceDocument(layout: LayoutDto): void;
}

export type EditorStore = EditorState & EditorActions;
```

- [x] **Step 2: 실패하는 테스트 3개 작성**

`src/features/room-editor/lib/geometry.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  ZOOM_STEPS,
  canvasToScreen,
  clampToRoom,
  fitViewport,
  rotateBy,
  screenToCanvas,
  snap,
  stepZoom,
  zoomViewportAt,
} from "./geometry";

describe("좌표 변환", () => {
  it("screen → canvas → screen 왕복하면 원래 점으로 돌아온다", () => {
    const v = { zoom: 1.25, offsetX: 100, offsetY: -50 };
    const p = { x: 37, y: 91 };
    const back = canvasToScreen(screenToCanvas(p, v), v);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("zoomViewportAt 은 앵커 화면 좌표 아래의 캔버스 점을 고정한다", () => {
    const v = { zoom: 1, offsetX: 20, offsetY: 30 };
    const anchor = { x: 300, y: 200 };
    const before = screenToCanvas(anchor, v);
    const next = zoomViewportAt(v, anchor, 1.5);
    const after = screenToCanvas(anchor, next);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(1.5);
  });
});

describe("zoom 단계", () => {
  it("stepZoom 은 정의된 단계를 오르내리고 양 끝에서 멈춘다", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.5, 1)).toBe(1.5);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it("단계 사이의 값(fit 결과 등)에서도 다음 단계로 간다", () => {
    expect(stepZoom(0.9, 1)).toBe(1);
    expect(stepZoom(0.9, -1)).toBe(0.75);
  });

  it("ZOOM_STEPS 는 PRD 8.1 의 50/75/100/125/150%", () => {
    expect(ZOOM_STEPS).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
  });
});

describe("snap / clamp / rotate", () => {
  it("snap 은 그리드 배수로 반올림하고 grid 0 이면 그대로", () => {
    expect(snap(14, 10)).toBe(10);
    expect(snap(15, 10)).toBe(20);
    expect(snap(13, 0)).toBe(13);
  });

  it("clampToRoom 은 좌상단을 room 안쪽으로 밀어 넣는다", () => {
    const size = { width: 40, height: 40 };
    const room = { width: 1000, height: 800 };
    expect(clampToRoom({ x: -10, y: 790 }, size, room)).toEqual({ x: 0, y: 760 });
    expect(clampToRoom({ x: 100, y: 100 }, size, room)).toEqual({ x: 100, y: 100 });
  });

  it("rotateBy 는 90° 단위로 순환한다", () => {
    expect(rotateBy(0, 1)).toBe(90);
    expect(rotateBy(270, 1)).toBe(0);
    expect(rotateBy(0, -1)).toBe(270);
  });
});

describe("fitViewport", () => {
  it("room 이 뷰포트 안에 들어가는 가장 큰 zoom 단계를 고르고 가운데 정렬한다", () => {
    const v = fitViewport({ width: 1000, height: 800 }, { width: 1200, height: 900 }, 40);
    // 사용 가능 영역 1120×820 → scale 1.025 → 단계 중 1.0
    expect(v.zoom).toBe(1);
    expect(v.offsetX).toBeCloseTo((1200 - 1000) / 2);
    expect(v.offsetY).toBeCloseTo((900 - 800) / 2);
  });

  it("뷰포트가 작으면 최소 단계 0.5 까지 내려간다", () => {
    expect(fitViewport({ width: 4000, height: 4000 }, { width: 500, height: 500 }).zoom).toBe(0.5);
  });
});
```

`src/features/room-editor/lib/history.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { EditorDocument } from "../model/types";
import { emptyHistory, pushHistory, redoHistory, undoHistory } from "./history";

const doc = (tag: string): EditorDocument => ({
  roomId: tag,
  width: 1,
  height: 1,
  objects: {},
  order: [],
});

describe("history", () => {
  it("push 하면 future 가 비워진다 (undo 후 새 편집 = 분기 폐기)", () => {
    const h1 = pushHistory(emptyHistory, doc("a"));
    const undone = undoHistory(h1, doc("b"));
    expect(undone?.history.future).toHaveLength(1);
    const h2 = pushHistory(undone!.history, doc("c"));
    expect(h2.future).toHaveLength(0);
  });

  it("undo 는 이전 문서의 '같은 참조' 를 돌려준다", () => {
    const a = doc("a");
    const b = doc("b");
    const h = pushHistory(emptyHistory, a);
    const u = undoHistory(h, b)!;
    expect(u.document).toBe(a);
    const r = redoHistory(u.history, u.document)!;
    expect(r.document).toBe(b);
    expect(r.history.past).toEqual([a]);
  });

  it("되돌릴 것이 없으면 null", () => {
    expect(undoHistory(emptyHistory, doc("x"))).toBeNull();
    expect(redoHistory(emptyHistory, doc("x"))).toBeNull();
  });

  it("limit 을 넘으면 가장 오래된 스냅샷부터 버린다", () => {
    let h = emptyHistory;
    for (let i = 0; i < 5; i++) h = pushHistory(h, doc(String(i)), 3);
    expect(h.past.map((d) => d.roomId)).toEqual(["2", "3", "4"]);
  });
});
```

`src/features/room-editor/lib/document.test.ts`
```ts
import { describe, expect, it } from "vitest";
import type { LayoutDto, SpaceObjectDto } from "@/shared/contracts";
import {
  createObject,
  fromLayoutDto,
  insertObject,
  nextSeatName,
  orderedObjects,
  patchObject,
  removeObject,
  toSaveInput,
} from "./document";

const seat = (id: string, zIndex: number, name = id): SpaceObjectDto => ({
  id,
  roomId: "r",
  type: "seat",
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  rotation: 0,
  zIndex,
  seat: { id: `seat-${id}`, name, status: "available" },
});

const table = (id: string, zIndex: number): SpaceObjectDto => ({
  id,
  roomId: "r",
  type: "table",
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  rotation: 0,
  zIndex,
});

const layout: LayoutDto = {
  roomId: "r",
  width: 1000,
  height: 800,
  layoutVersion: 3,
  objects: [seat("b", 2, "S2"), seat("a", 1, "S1"), table("c", 5)],
};

describe("fromLayoutDto / toSaveInput", () => {
  it("zIndex 순으로 order 를 만든다", () => {
    expect(fromLayoutDto(layout).order).toEqual(["a", "b", "c"]);
  });

  it("toSaveInput 은 order 인덱스를 zIndex 로 쓰고 roomId 를 제거한다", () => {
    const input = toSaveInput(fromLayoutDto(layout), 3);
    expect(input.expectedVersion).toBe(3);
    expect(input.objects.map((o) => [o.id, o.zIndex])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect("roomId" in input.objects[0]!).toBe(false);
    const first = input.objects[0]!;
    expect(first.type === "seat" && first.seat.name).toBe("S1");
  });
});

describe("insert / remove / patch", () => {
  it("insertObject 는 맨 위(order 끝)에 추가한다", () => {
    const d = insertObject(fromLayoutDto(layout), table("d", 0));
    expect(d.order).toEqual(["a", "b", "c", "d"]);
    expect(orderedObjects(d).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("removeObject 는 objects 와 order 양쪽에서 제거하고 없는 id 면 같은 참조", () => {
    const base = fromLayoutDto(layout);
    const d = removeObject(base, "b");
    expect(d.order).toEqual(["a", "c"]);
    expect(d.objects["b"]).toBeUndefined();
    expect(removeObject(base, "nope")).toBe(base);
  });

  it("patchObject 는 위치·크기·회전을 바꾸고 새 참조를 만든다", () => {
    const base = fromLayoutDto(layout);
    const d = patchObject(base, "a", { x: 50, rotation: 90 });
    expect(d).not.toBe(base);
    expect(d.objects["a"]).toMatchObject({ x: 50, rotation: 90 });
    expect(base.objects["a"]?.x).toBe(0); // 원본 불변
  });

  it("patchObject 의 seatName/seatStatus 는 seat 에만 적용되고 table 에는 무시된다", () => {
    const base = fromLayoutDto(layout);
    const d = patchObject(base, "a", { seatName: "VIP", seatStatus: "disabled" });
    const a = d.objects["a"];
    expect(a?.type === "seat" && a.seat).toEqual({ id: "seat-a", name: "VIP", status: "disabled" });
    expect(patchObject(base, "c", { seatName: "X" })).toBe(base);
  });
});

describe("createObject / nextSeatName", () => {
  it("createObject 는 중심 좌표를 좌상단으로 바꾸고 seat 는 이름과 새 seat.id 를 가진다", () => {
    const o = createObject({
      type: "seat",
      roomId: "r",
      center: { x: 100, y: 100 },
      zIndex: 0,
      seatName: "S9",
    });
    expect(o).toMatchObject({ type: "seat", x: 80, y: 80, width: 40, height: 40, rotation: 0 });
    expect(o.type === "seat" && o.seat.name).toBe("S9");
    expect(o.type === "seat" && o.seat.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nextSeatName 은 기존 좌석 수 + 1 을 쓰되 이미 있는 이름은 건너뛴다", () => {
    const d = fromLayoutDto(layout); // S1, S2 존재
    expect(nextSeatName(d)).toBe("S3");
    const d2 = insertObject(d, seat("z", 9, "S3"));
    expect(nextSeatName(d2)).toBe("S4");
  });
});
```

- [x] **Step 3: 실패 확인**

Run: `pnpm test src/features/room-editor`
Expected: 3개 파일 모두 FAIL (모듈 없음)

- [x] **Step 4: 구현**

`src/features/room-editor/lib/geometry.ts`
```ts
import { ROTATIONS, type Rotation } from "@/shared/contracts";
import type { Point, Size, Viewport } from "../model/types";

/** PRD 8.1: 50 / 75 / 100 / 125 / 150 % */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

/**
 * 현재 zoom 에서 한 단계 이동. 현재 값이 단계 사이(fit 결과)여도 동작:
 * +1 은 "현재보다 큰 첫 단계", -1 은 "현재보다 작은 마지막 단계".
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  const eps = 1e-6;
  if (direction === 1) {
    return ZOOM_STEPS.find((z) => z > current + eps) ?? MAX_ZOOM;
  }
  return [...ZOOM_STEPS].reverse().find((z) => z < current - eps) ?? MIN_ZOOM;
}

export function screenToCanvas(p: Point, v: Viewport): Point {
  return { x: (p.x - v.offsetX) / v.zoom, y: (p.y - v.offsetY) / v.zoom };
}

export function canvasToScreen(p: Point, v: Viewport): Point {
  return { x: p.x * v.zoom + v.offsetX, y: p.y * v.zoom + v.offsetY };
}

/**
 * anchorScreen(화면 좌표) 아래에 있는 캔버스 점이 zoom 후에도 같은 화면 위치에 남도록 offset 을 조정.
 * 휠 줌에서 "커서 위치 고정" 이 이것.
 */
export function zoomViewportAt(v: Viewport, anchorScreen: Point, nextZoom: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const anchorCanvas = screenToCanvas(anchorScreen, v);
  return {
    zoom,
    offsetX: anchorScreen.x - anchorCanvas.x * zoom,
    offsetY: anchorScreen.y - anchorCanvas.y * zoom,
  };
}

export function snap(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: Point, grid: number): Point {
  return { x: snap(p.x, grid), y: snap(p.y, grid) };
}

/** 좌상단 pos 를 room 안에 유지. 오브젝트가 room 보다 크면 0 에 붙인다. */
export function clampToRoom(pos: Point, size: Size, room: Size): Point {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, room.width - size.width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, room.height - size.height)),
  };
}

export function rotateBy(rotation: Rotation, direction: 1 | -1): Rotation {
  const i = ROTATIONS.indexOf(rotation);
  return ROTATIONS[(i + direction + ROTATIONS.length) % ROTATIONS.length] ?? 0;
}

/**
 * room 전체가 보이는 가장 큰 zoom 단계를 고르고 가운데 정렬한 뷰포트.
 * 에디터 첫 진입과 "맞춤" 버튼에서 사용.
 */
export function fitViewport(room: Size, viewportSize: Size, padding = 40): Viewport {
  const availW = Math.max(1, viewportSize.width - padding * 2);
  const availH = Math.max(1, viewportSize.height - padding * 2);
  const scale = Math.min(availW / room.width, availH / room.height);
  const zoom = [...ZOOM_STEPS].reverse().find((z) => z <= scale) ?? MIN_ZOOM;
  return {
    zoom,
    offsetX: (viewportSize.width - room.width * zoom) / 2,
    offsetY: (viewportSize.height - room.height * zoom) / 2,
  };
}
```

`src/features/room-editor/lib/history.ts`
```ts
import type { EditorDocument, EditorHistory } from "../model/types";

/** 스냅샷 방식이라 문서 참조만 쌓인다. 100 단계면 수백 오브젝트 문서도 메모리 부담 없음. */
export const HISTORY_LIMIT = 100;

export const emptyHistory: EditorHistory = { past: [], future: [] };

/** 새 변경 발생: 직전 문서를 past 에 넣고 future(redo 분기)는 버린다. */
export function pushHistory(
  history: EditorHistory,
  snapshot: EditorDocument,
  limit = HISTORY_LIMIT,
): EditorHistory {
  const past = [...history.past, snapshot];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undoHistory(
  history: EditorHistory,
  current: EditorDocument,
): { history: EditorHistory; document: EditorDocument } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    document: previous,
  };
}

export function redoHistory(
  history: EditorHistory,
  current: EditorDocument,
): { history: EditorHistory; document: EditorDocument } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    document: next,
  };
}
```

`src/features/room-editor/lib/document.ts`
```ts
import type {
  LayoutDto,
  ObjectType,
  SaveLayoutInput,
  SpaceObjectDto,
  SpaceObjectInput,
} from "@/shared/contracts";
import type { EditorDocument, ObjectPatch, Point, Size } from "../model/types";

/** 새 오브젝트 기본 크기 (캔버스 px). PRD 6.1 "기본 좌표에 생성" 의 크기 부분 */
export const DEFAULT_OBJECT_SIZE: Record<ObjectType, Size> = {
  seat: { width: 40, height: 40 },
  table: { width: 120, height: 60 },
  wall: { width: 200, height: 10 },
};

/** 서버 LayoutDto → 에디터 문서. zIndex 오름차순이 order. (로드 1회 접점) */
export function fromLayoutDto(layout: LayoutDto): EditorDocument {
  const sorted = [...layout.objects].sort((a, b) => a.zIndex - b.zIndex);
  const objects: Record<string, SpaceObjectDto> = {};
  for (const o of sorted) objects[o.id] = o;
  return {
    roomId: layout.roomId,
    width: layout.width,
    height: layout.height,
    objects,
    order: sorted.map((o) => o.id),
  };
}

/** 에디터 문서 → PUT body. order 인덱스가 zIndex, roomId 는 URL 에 있으므로 제거. (저장 1회 접점) */
export function toSaveInput(doc: EditorDocument, expectedVersion: number): SaveLayoutInput {
  const objects: SpaceObjectInput[] = [];
  doc.order.forEach((id, index) => {
    const o = doc.objects[id];
    if (!o) return;
    const common = {
      id: o.id,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      zIndex: index,
    };
    if (o.type === "seat") objects.push({ ...common, type: "seat", seat: o.seat });
    else objects.push({ ...common, type: o.type });
  });
  return { expectedVersion, objects };
}

export function orderedObjects(doc: EditorDocument): SpaceObjectDto[] {
  return doc.order.flatMap((id) => {
    const o = doc.objects[id];
    return o ? [o] : [];
  });
}

export function insertObject(doc: EditorDocument, object: SpaceObjectDto): EditorDocument {
  return {
    ...doc,
    objects: { ...doc.objects, [object.id]: object },
    order: [...doc.order, object.id],
  };
}

export function removeObject(doc: EditorDocument, id: string): EditorDocument {
  if (!(id in doc.objects)) return doc;
  const objects = { ...doc.objects };
  delete objects[id];
  return { ...doc, objects, order: doc.order.filter((x) => x !== id) };
}

/**
 * 부분 수정. seatName/seatStatus 는 seat 에만 적용. 바뀐 게 없으면 같은 참조를 돌려
 * 불필요한 히스토리/Dirty 를 만들지 않는다.
 */
export function patchObject(doc: EditorDocument, id: string, patch: ObjectPatch): EditorDocument {
  const current = doc.objects[id];
  if (!current) return doc;

  const next: SpaceObjectDto = {
    ...current,
    x: patch.x ?? current.x,
    y: patch.y ?? current.y,
    width: patch.width ?? current.width,
    height: patch.height ?? current.height,
    rotation: patch.rotation ?? current.rotation,
  };
  if (next.type === "seat" && current.type === "seat") {
    next.seat = {
      ...current.seat,
      name: patch.seatName ?? current.seat.name,
      status: patch.seatStatus ?? current.seat.status,
    };
  }

  const unchanged =
    next.x === current.x &&
    next.y === current.y &&
    next.width === current.width &&
    next.height === current.height &&
    next.rotation === current.rotation &&
    (next.type !== "seat" ||
      current.type !== "seat" ||
      (next.seat.name === current.seat.name && next.seat.status === current.seat.status));
  if (unchanged) return doc;

  return { ...doc, objects: { ...doc.objects, [id]: next } };
}

interface CreateObjectArgs {
  type: ObjectType;
  roomId: string;
  /** 오브젝트 중심이 올 캔버스 좌표. 뷰포트 중심을 넘긴다 */
  center: Point;
  zIndex: number;
  /** seat 전용 기본 이름 */
  seatName?: string;
}

/** id 는 클라이언트가 만든다(uuid). 저장 RPC 가 그대로 upsert 하므로 재저장해도 같은 오브젝트. */
export function createObject({ type, roomId, center, zIndex, seatName }: CreateObjectArgs): SpaceObjectDto {
  const size = DEFAULT_OBJECT_SIZE[type];
  const common = {
    id: crypto.randomUUID(),
    roomId,
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: 0 as const,
    zIndex,
  };
  switch (type) {
    case "seat":
      return {
        ...common,
        type: "seat",
        seat: { id: crypto.randomUUID(), name: seatName ?? "S1", status: "available" },
      };
    case "table":
      return { ...common, type: "table" };
    case "wall":
      return { ...common, type: "wall" };
  }
}

/** "S{n}" 자동 이름. n = 좌석 수 + 1 부터 시작해 중복이면 올린다. */
export function nextSeatName(doc: EditorDocument): string {
  const names = new Set<string>();
  let count = 0;
  for (const id of doc.order) {
    const o = doc.objects[id];
    if (o?.type === "seat") {
      count += 1;
      names.add(o.seat.name);
    }
  }
  let n = count + 1;
  while (names.has(`S${n}`)) n += 1;
  return `S${n}`;
}
```

- [x] **Step 5: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 테스트 51개 통과

- [x] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(editor): 순수 로직 - 좌표 변환·zoom 단계·스냅·클램프, 히스토리, 문서 변환"
```

---

### Task 3: Zustand 스토어 + Provider + selectors

**Files:**
- Create: `src/features/room-editor/model/store.ts`
- Create: `src/features/room-editor/model/store.test.ts`
- Create: `src/features/room-editor/model/selectors.ts`
- Create: `src/features/room-editor/model/editor-store-provider.tsx`
- Create: `src/features/room-editor/index.ts`

**Interfaces:**
- Consumes: Task 2 전부, `LayoutDto`.
- Produces: `createEditorStore({ layout, gridSize? }): EditorStoreApi`, `EditorStoreApi`, `EditorStoreProvider({ layout, children })`, `useEditorStore(selector)`, `useEditorStoreApi()`, selectors: `selectIsDirty`, `selectCanUndo`, `selectCanRedo`, `selectSelectedObject`, `selectSaveStatus`.

- [x] **Step 1: 실패하는 테스트** — `src/features/room-editor/model/store.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { LayoutDto } from "@/shared/contracts";
import { selectCanRedo, selectCanUndo, selectIsDirty } from "./selectors";
import { createEditorStore } from "./store";

const layout: LayoutDto = { roomId: "r", width: 1000, height: 800, layoutVersion: 1, objects: [] };

function makeStore() {
  const store = createEditorStore({ layout });
  // 캔버스 크기 보고 → fit. 이후 addObject 가 뷰포트 중심을 계산할 수 있다
  store.getState().setViewportSize({ width: 1200, height: 900 });
  return store;
}

describe("에디터 스토어", () => {
  it("setViewportSize 최초 호출은 room 을 화면에 맞춘다", () => {
    const store = createEditorStore({ layout });
    store.getState().setViewportSize({ width: 1200, height: 900 });
    expect(store.getState().viewport.zoom).toBe(1);
    // 두 번째 호출(리사이즈)은 뷰포트를 건드리지 않는다
    store.getState().setViewport({ zoom: 1.5 });
    store.getState().setViewportSize({ width: 1300, height: 900 });
    expect(store.getState().viewport.zoom).toBe(1.5);
  });

  it("addObject 는 뷰포트 중심에 스냅해 추가하고 선택하며 히스토리 1단계", () => {
    const store = makeStore();
    const id = store.getState().addObject("seat");
    const s = store.getState();
    expect(s.document.order).toEqual([id]);
    expect(s.selectedObjectId).toBe(id);
    expect(selectCanUndo(s)).toBe(true);
    expect(selectIsDirty(s)).toBe(true);
    // 뷰포트 중심(600,450) = 캔버스 (500,400) → 좌상단 (480,380), 10px 그리드
    expect(s.document.objects[id]).toMatchObject({ x: 480, y: 380, width: 40, height: 40 });
    expect(s.document.objects[id]?.type === "seat" && s.document.objects[id].seat.name).toBe("S1");
  });

  it("undo 로 저장 시점 문서 참조로 돌아가면 dirty 가 false", () => {
    const store = makeStore();
    store.getState().addObject("table");
    store.getState().undo();
    const s = store.getState();
    expect(s.document.order).toEqual([]);
    expect(selectIsDirty(s)).toBe(false);
    expect(s.selectedObjectId).toBeNull();
    expect(selectCanRedo(s)).toBe(true);
  });

  it("드래그 1회(moveObject 여러 번)는 히스토리 1단계", () => {
    const store = makeStore();
    const id = store.getState().addObject("seat");
    const before = store.getState().history.past.length;

    store.getState().beginGesture();
    for (let i = 1; i <= 10; i++) {
      store.getState().moveObject(id, { x: 480 + i * 10, y: 380 });
    }
    store.getState().endGesture();

    const s = store.getState();
    expect(s.history.past.length).toBe(before + 1);
    expect(s.document.objects[id]?.x).toBe(580);

    store.getState().undo();
    expect(store.getState().document.objects[id]?.x).toBe(480);
  });

  it("moveObject 는 스냅과 room 클램프를 적용한다", () => {
    const store = makeStore();
    const id = store.getState().addObject("seat");
    store.getState().beginGesture();
    store.getState().moveObject(id, { x: -33, y: 2000 });
    store.getState().endGesture();
    expect(store.getState().document.objects[id]).toMatchObject({ x: 0, y: 760 });
  });

  it("문서 변경 없는 제스처는 히스토리에 남지 않는다", () => {
    const store = makeStore();
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it("rotateSelected 는 90° 씩 순환하고 updateSelected 는 seat 이름을 바꾼다", () => {
    const store = makeStore();
    const id = store.getState().addObject("seat");
    store.getState().rotateSelected(-1);
    expect(store.getState().document.objects[id]?.rotation).toBe(270);
    store.getState().updateSelected({ seatName: "VIP-1" });
    const o = store.getState().document.objects[id];
    expect(o?.type === "seat" && o.seat.name).toBe("VIP-1");
    expect(store.getState().history.past).toHaveLength(3); // add, rotate, rename
  });

  it("deleteSelected 는 선택을 비우고 히스토리 1단계", () => {
    const store = makeStore();
    store.getState().addObject("wall");
    store.getState().deleteSelected();
    const s = store.getState();
    expect(s.document.order).toEqual([]);
    expect(s.selectedObjectId).toBeNull();
    expect(s.history.past).toHaveLength(2);
  });

  it("zoomStep 은 단계를 옮기고 panBy 는 offset 을 더한다", () => {
    const store = makeStore();
    store.getState().zoomStep(1, { x: 0, y: 0 });
    expect(store.getState().viewport.zoom).toBe(1.25);
    const { offsetX } = store.getState().viewport;
    store.getState().panBy(15, -5);
    expect(store.getState().viewport.offsetX).toBe(offsetX + 15);
  });

  it("저장 중 편집은 dirty 로 남고, 성공 시 요청 시점 문서만 saved 가 된다", () => {
    const store = makeStore();
    store.getState().addObject("seat");
    store.getState().saveStarted();
    expect(store.getState().persistence.status).toBe("saving");
    store.getState().addObject("seat"); // 저장 중 편집
    store.getState().saveSucceeded(2);
    const s = store.getState();
    expect(s.persistence.layoutVersion).toBe(2);
    expect(s.persistence.savedDocument.order).toHaveLength(1);
    expect(selectIsDirty(s)).toBe(true);
  });

  it("saveFailed 는 상태와 메시지를 남기고 문서는 유지한다", () => {
    const store = makeStore();
    store.getState().addObject("seat");
    store.getState().saveStarted();
    store.getState().saveFailed("충돌", "conflict");
    const s = store.getState();
    expect(s.persistence.status).toBe("conflict");
    expect(s.persistence.error).toBe("충돌");
    expect(s.document.order).toHaveLength(1);
    store.getState().dismissSaveError();
    expect(store.getState().persistence.status).toBe("idle");
  });

  it("replaceDocument 는 서버 문서로 교체하고 히스토리·선택·dirty 를 초기화한다", () => {
    const store = makeStore();
    store.getState().addObject("seat");
    store.getState().replaceDocument({ ...layout, layoutVersion: 9 });
    const s = store.getState();
    expect(s.document.order).toEqual([]);
    expect(selectCanUndo(s)).toBe(false);
    expect(selectIsDirty(s)).toBe(false);
    expect(s.selectedObjectId).toBeNull();
    expect(s.persistence.layoutVersion).toBe(9);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/features/room-editor/model`
Expected: FAIL (모듈 없음)

- [x] **Step 3: 구현**

`src/features/room-editor/model/store.ts`
```ts
import { createStore } from "zustand/vanilla";
import type { LayoutDto } from "@/shared/contracts";
import {
  createObject,
  fromLayoutDto,
  insertObject,
  nextSeatName,
  patchObject,
  removeObject,
  DEFAULT_OBJECT_SIZE,
} from "../lib/document";
import {
  clampToRoom,
  fitViewport,
  rotateBy,
  screenToCanvas,
  snapPoint,
  stepZoom,
  zoomViewportAt,
} from "../lib/geometry";
import { emptyHistory, pushHistory, redoHistory, undoHistory } from "../lib/history";
import type { EditorDocument, EditorState, EditorStore, Point } from "./types";

export interface CreateEditorStoreOptions {
  layout: LayoutDto;
  gridSize?: number;
}

/**
 * 에디터 인스턴스 1개 = 스토어 1개. Provider 가 만든다. 모듈 스코프 싱글톤을 두지 않는 이유:
 * SSR 에서 요청 간 상태가 섞이고, 같은 페이지에 에디터가 둘 이상 오면 충돌한다.
 */
export function createEditorStore({ layout, gridSize = 10 }: CreateEditorStoreOptions) {
  const document = fromLayoutDto(layout);

  const initialState: EditorState = {
    document,
    history: emptyHistory,
    gestureSnapshot: null,
    selectedObjectId: null,
    viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
    viewportSize: { width: 0, height: 0 },
    interaction: { type: "idle" },
    persistence: {
      savedDocument: document,
      inFlightDocument: null,
      layoutVersion: layout.layoutVersion,
      status: "idle",
      error: null,
    },
    settings: { gridSize, snapToGrid: true },
  };

  return createStore<EditorStore>()((set, get) => {
    /** 히스토리 1단계로 기록되는 문서 교체. 같은 참조면 아무것도 안 한다. */
    const commit = (next: EditorDocument) => {
      const { document: current, history } = get();
      if (next === current) return;
      set({ document: next, history: pushHistory(history, current) });
    };

    /** 스냅 + 클램프. moveObject / addObject 공용 */
    const normalizePosition = (pos: Point, size: { width: number; height: number }) => {
      const { document: doc, settings } = get();
      const snapped = settings.snapToGrid ? snapPoint(pos, settings.gridSize) : pos;
      return clampToRoom(snapped, size, { width: doc.width, height: doc.height });
    };

    return {
      ...initialState,

      // ---------------- 문서 ----------------
      addObject(type) {
        const { document: doc, viewport, viewportSize } = get();
        // 새 오브젝트는 "지금 보고 있는 화면의 중심" 에. (0,0) 에 만들면 zoom/pan 상태에서 안 보인다
        const center = screenToCanvas(
          { x: viewportSize.width / 2, y: viewportSize.height / 2 },
          viewport,
        );
        const draft = createObject({
          type,
          roomId: doc.roomId,
          center,
          zIndex: doc.order.length,
          seatName: type === "seat" ? nextSeatName(doc) : undefined,
        });
        const pos = normalizePosition({ x: draft.x, y: draft.y }, DEFAULT_OBJECT_SIZE[type]);
        const object = { ...draft, ...pos };
        commit(insertObject(doc, object));
        set({ selectedObjectId: object.id });
        return object.id;
      },

      deleteSelected() {
        const { document: doc, selectedObjectId } = get();
        if (!selectedObjectId) return;
        commit(removeObject(doc, selectedObjectId));
        set({ selectedObjectId: null });
      },

      rotateSelected(direction) {
        const { document: doc, selectedObjectId } = get();
        if (!selectedObjectId) return;
        const o = doc.objects[selectedObjectId];
        if (!o) return;
        commit(patchObject(doc, selectedObjectId, { rotation: rotateBy(o.rotation, direction) }));
      },

      updateSelected(patch) {
        const { document: doc, selectedObjectId } = get();
        if (!selectedObjectId) return;
        const o = doc.objects[selectedObjectId];
        if (!o) return;
        // 크기는 최소 10px. 위치는 새 크기 기준으로 클램프
        const width = Math.max(10, patch.width ?? o.width);
        const height = Math.max(10, patch.height ?? o.height);
        const pos = clampToRoom(
          { x: patch.x ?? o.x, y: patch.y ?? o.y },
          { width, height },
          { width: doc.width, height: doc.height },
        );
        commit(patchObject(doc, selectedObjectId, { ...patch, ...pos, width, height }));
      },

      moveObject(id, topLeft) {
        const { document: doc } = get();
        const o = doc.objects[id];
        if (!o) return;
        const pos = normalizePosition(topLeft, { width: o.width, height: o.height });
        const next = patchObject(doc, id, pos);
        if (next !== doc) set({ document: next }); // 히스토리 없음. endGesture 가 1단계로 묶는다
      },

      beginGesture() {
        set({ gestureSnapshot: get().document });
      },

      endGesture() {
        const { gestureSnapshot, document: doc, history } = get();
        if (!gestureSnapshot) return;
        set({
          gestureSnapshot: null,
          history: gestureSnapshot === doc ? history : pushHistory(history, gestureSnapshot),
        });
      },

      // ---------------- 히스토리 ----------------
      undo() {
        const { history, document: doc, selectedObjectId } = get();
        const result = undoHistory(history, doc);
        if (!result) return;
        set({
          history: result.history,
          document: result.document,
          // 되돌린 문서에 없는 오브젝트가 선택돼 있으면 해제
          selectedObjectId:
            selectedObjectId && selectedObjectId in result.document.objects ? selectedObjectId : null,
        });
      },

      redo() {
        const { history, document: doc, selectedObjectId } = get();
        const result = redoHistory(history, doc);
        if (!result) return;
        set({
          history: result.history,
          document: result.document,
          selectedObjectId:
            selectedObjectId && selectedObjectId in result.document.objects ? selectedObjectId : null,
        });
      },

      // ---------------- 선택 ----------------
      select(id) {
        if (get().selectedObjectId !== id) set({ selectedObjectId: id });
      },

      // ---------------- 뷰포트 ----------------
      setViewport(patch) {
        set({ viewport: { ...get().viewport, ...patch } });
      },

      zoomStep(direction, anchorScreen) {
        const { viewport, viewportSize } = get();
        const anchor = anchorScreen ?? { x: viewportSize.width / 2, y: viewportSize.height / 2 };
        set({ viewport: zoomViewportAt(viewport, anchor, stepZoom(viewport.zoom, direction)) });
      },

      panBy(dx, dy) {
        const v = get().viewport;
        set({ viewport: { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy } });
      },

      setViewportSize(size) {
        const first = get().viewportSize.width === 0 && get().viewportSize.height === 0;
        set({ viewportSize: size });
        if (first && size.width > 0 && size.height > 0) get().fitToScreen();
      },

      fitToScreen() {
        const { document: doc, viewportSize } = get();
        set({ viewport: fitViewport({ width: doc.width, height: doc.height }, viewportSize) });
      },

      setInteraction(interaction) {
        set({ interaction });
      },

      // ---------------- 영속 ----------------
      saveStarted() {
        const { persistence, document: doc } = get();
        set({
          persistence: { ...persistence, inFlightDocument: doc, status: "saving", error: null },
        });
      },

      saveSucceeded(layoutVersion) {
        const { persistence } = get();
        set({
          persistence: {
            savedDocument: persistence.inFlightDocument ?? persistence.savedDocument,
            inFlightDocument: null,
            layoutVersion,
            status: "idle",
            error: null,
          },
        });
      },

      saveFailed(message, status = "error") {
        const { persistence } = get();
        set({ persistence: { ...persistence, inFlightDocument: null, status, error: message } });
      },

      dismissSaveError() {
        const { persistence } = get();
        if (persistence.status === "saving") return;
        set({ persistence: { ...persistence, status: "idle", error: null } });
      },

      replaceDocument(layout) {
        const next = fromLayoutDto(layout);
        set({
          document: next,
          history: emptyHistory,
          gestureSnapshot: null,
          selectedObjectId: null,
          interaction: { type: "idle" },
          persistence: {
            savedDocument: next,
            inFlightDocument: null,
            layoutVersion: layout.layoutVersion,
            status: "idle",
            error: null,
          },
        });
      },
    };
  });
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>;
```

`src/features/room-editor/model/selectors.ts`
```ts
import type { SpaceObjectDto } from "@/shared/contracts";
import type { EditorStore } from "./types";

// 파생 상태. 새 객체/배열을 만들지 않는 것만 여기 둔다 (useEditorStore 의 참조 비교와 맞물림).
export const selectIsDirty = (s: EditorStore) => s.document !== s.persistence.savedDocument;
export const selectCanUndo = (s: EditorStore) => s.history.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.history.future.length > 0;
export const selectSaveStatus = (s: EditorStore) => s.persistence.status;
export const selectSelectedObject = (s: EditorStore): SpaceObjectDto | null =>
  s.selectedObjectId ? (s.document.objects[s.selectedObjectId] ?? null) : null;
```

`src/features/room-editor/model/editor-store-provider.tsx`
```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { LayoutDto } from "@/shared/contracts";
import { createEditorStore, type EditorStoreApi } from "./store";
import type { EditorStore } from "./types";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface Props {
  /** 마운트 시 1회만 읽는다. 이후 TanStack Query 가 refetch 해도 스토어는 반응하지 않는다(의도). */
  layout: LayoutDto;
  children: ReactNode;
}

export function EditorStoreProvider({ layout, children }: Props) {
  const [store] = useState(() => createEditorStore({ layout }));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStoreApi(): EditorStoreApi {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStoreApi 는 EditorStoreProvider 안에서만 사용할 수 있습니다.");
  return store;
}

/** selector 결과가 바뀔 때만 리렌더. 객체/배열을 새로 만드는 selector 는 피한다. */
export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
```

`src/features/room-editor/index.ts` (이번 Task 시점)
```ts
export type { EditorDocument, EditorStore, Point, Viewport } from "./model/types";
export { createEditorStore, type EditorStoreApi } from "./model/store";
export { EditorStoreProvider, useEditorStore, useEditorStoreApi } from "./model/editor-store-provider";
export * from "./model/selectors";
export { fromLayoutDto, toSaveInput, orderedObjects } from "./lib/document";
```

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 테스트 63개 통과

- [x] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(editor): Zustand 스토어 - 문서 변경, 제스처 히스토리, 뷰포트, 저장 상태 전이"
```

---

### Task 4: 캔버스 — SVG 렌더, 선택, 드래그

**Files:**
- Create: `src/features/room-editor/ui/space-object-view.tsx`
- Create: `src/features/room-editor/ui/use-canvas-pointer.ts`
- Create: `src/features/room-editor/ui/editor-canvas.tsx`
- Modify: `src/features/room-editor/index.ts` (EditorCanvas export)

**Interfaces:**
- Consumes: `useEditorStore`, `useEditorStoreApi`, `orderedObjects`, `screenToCanvas`.
- Produces: `<EditorCanvas />`, `<SpaceObjectView object selected />`, `useCanvasPointer(svgRef): { handlers, isPanning }`.

- [x] **Step 1: 구현**

`src/features/room-editor/ui/space-object-view.tsx`
```tsx
import type { SpaceObjectDto } from "@/shared/contracts";

interface Props {
  object: SpaceObjectDto;
  selected: boolean;
}

const FILL: Record<SpaceObjectDto["type"], string> = {
  seat: "#dbeafe",
  table: "#fef3c7",
  wall: "#52525b",
};
const STROKE: Record<SpaceObjectDto["type"], string> = {
  seat: "#60a5fa",
  table: "#f59e0b",
  wall: "#3f3f46",
};

/**
 * 오브젝트 하나. 회전은 중심 기준(rotate(r cx cy)). 히트 테스트는 SVG 가 회전된 도형 그대로 해 준다.
 * data-object-id 로 포인터 핸들러가 어떤 오브젝트를 잡았는지 찾는다.
 */
export function SpaceObjectView({ object, selected }: Props) {
  const { x, y, width, height, rotation, type } = object;
  const disabled = type === "seat" && object.seat.status === "disabled";

  return (
    <g
      data-object-id={object.id}
      transform={`translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})`}
      className="cursor-move"
    >
      <rect
        width={width}
        height={height}
        rx={type === "seat" ? 6 : 2}
        fill={disabled ? "#e4e4e7" : FILL[type]}
        stroke={STROKE[type]}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {type === "seat" ? (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill={disabled ? "#71717a" : "#1e3a8a"}
          className="pointer-events-none select-none"
        >
          {object.seat.name}
        </text>
      ) : null}
      {selected ? (
        <rect
          x={-3}
          y={-3}
          width={width + 6}
          height={height + 6}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
        />
      ) : null}
    </g>
  );
}
```

`src/features/room-editor/ui/use-canvas-pointer.ts`
```ts
"use client";

import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { screenToCanvas } from "../lib/geometry";
import { useEditorStoreApi } from "../model/editor-store-provider";
import type { Point } from "../model/types";

/**
 * 캔버스 포인터 제스처. 이 Task 에서는 선택 + 드래그. (Task 7 에서 팬 추가)
 *
 * 좌표 흐름: clientX/Y → svg 좌상단 기준 화면 좌표 → screenToCanvas → 캔버스 좌표.
 * 드래그는 "잡은 지점의 오프셋(grabOffset)" 을 기억해 두고 매 move 마다
 * 좌상단 = 현재 캔버스 좌표 - grabOffset 으로 계산한다. delta 누적이 아니라 절대값이라 오차가 안 쌓인다.
 */
export function useCanvasPointer(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();

  const toScreen = useCallback(
    (e: ReactPointerEvent): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [svgRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const s = store.getState();
      const screen = toScreen(e);
      // 포인터가 svg 밖으로 나가도 move/up 을 계속 받는다
      e.currentTarget.setPointerCapture(e.pointerId);

      const target = (e.target as Element).closest("[data-object-id]");
      const id = target?.getAttribute("data-object-id") ?? null;
      if (!id) {
        s.select(null); // 빈 곳 클릭 = 선택 해제 (PRD 6.3)
        return;
      }
      const object = s.document.objects[id];
      if (!object) return;

      const canvas = screenToCanvas(screen, s.viewport);
      s.select(id);
      s.beginGesture();
      s.setInteraction({
        type: "drag",
        id,
        grabOffset: { x: canvas.x - object.x, y: canvas.y - object.y },
      });
    },
    [store, toScreen],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      if (s.interaction.type !== "drag") return;
      const canvas = screenToCanvas(toScreen(e), s.viewport);
      s.moveObject(s.interaction.id, {
        x: canvas.x - s.interaction.grabOffset.x,
        y: canvas.y - s.interaction.grabOffset.y,
      });
    },
    [store, toScreen],
  );

  const onPointerUp = useCallback(() => {
    const s = store.getState();
    if (s.interaction.type === "drag") s.endGesture(); // 드래그 1회 = 히스토리 1단계
    if (s.interaction.type !== "idle") s.setInteraction({ type: "idle" });
  }, [store]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    isPanning: false,
  };
}
```

`src/features/room-editor/ui/editor-canvas.tsx`
```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { orderedObjects } from "../lib/document";
import { useEditorStore } from "../model/editor-store-provider";
import { SpaceObjectView } from "./space-object-view";
import { useCanvasPointer } from "./use-canvas-pointer";

/**
 * 캔버스 본체. svg 하나에 <g transform="translate(offset) scale(zoom)"> 로 뷰포트를 표현한다.
 * 오브젝트 좌표는 전부 캔버스 단위 그대로 쓰고 변환은 이 g 가 담당 → 오브젝트 컴포넌트는 zoom 을 모른다.
 */
export function EditorCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const document = useEditorStore((s) => s.document);
  const viewport = useEditorStore((s) => s.viewport);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setViewportSize = useEditorStore((s) => s.setViewportSize);
  const objects = useMemo(() => orderedObjects(document), [document]);
  const { handlers, isPanning } = useCanvasPointer(svgRef);

  // 캔버스 DOM 크기를 스토어에 보고. 최초 보고에서 스토어가 fit 을 수행한다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const report = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setViewportSize]);

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full touch-none select-none bg-zinc-100 ${isPanning ? "cursor-grabbing" : ""}`}
      {...handlers}
    >
      <g transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.zoom})`}>
        {/* room 영역. 여기를 클릭하면 선택 해제 */}
        <rect
          width={document.width}
          height={document.height}
          fill="white"
          stroke="#d4d4d8"
          vectorEffect="non-scaling-stroke"
        />
        {objects.map((o) => (
          <SpaceObjectView key={o.id} object={o} selected={o.id === selectedId} />
        ))}
      </g>
    </svg>
  );
}
```

`src/features/room-editor/index.ts` 에 추가:
```ts
export { EditorCanvas } from "./ui/editor-canvas";
```

- [x] **Step 2: 임시 페이지로 눈 확인** (Task 9 전까지만 쓰는 최소 조립)

`src/app/(admin)/admin/rooms/[roomId]/editor/page.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomEditorPage } from "./room-editor-page";

interface Props {
  params: Promise<{ roomId: string }>;
}

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
```

`src/app/(admin)/admin/rooms/[roomId]/editor/room-editor-page.tsx` (Task 4 임시 버전)
```tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import { EditorCanvas, EditorStoreProvider } from "@/features/room-editor";

export function RoomEditorPage({ roomId }: { roomId: string }) {
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  return (
    <EditorStoreProvider layout={layout}>
      <div className="h-[70vh] rounded-lg border border-zinc-200 bg-white">
        <EditorCanvas />
      </div>
    </EditorStoreProvider>
  );
}
```

- [x] **Step 3: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 4: 브라우저 확인** (Task 1 Step 5 로 넣어 둔 A1 좌석·테이블이 있는 room)

1. `/admin/rooms/<id>/editor` 진입 → room 사각형이 화면 가운데에 맞춰 보인다.
2. A1 좌석 클릭 → 파란 점선 선택 테두리. 빈 곳 클릭 → 해제.
3. 좌석을 드래그 → 10px 단위로 따라오고 room 밖으로 안 나간다. 회전된 테이블(90°)도 잡힌다.

- [x] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(editor): SVG 캔버스 - 뷰포트 transform, 오브젝트 렌더, 선택, 드래그"
```

---

### Task 5: 툴바 + Properties Panel + Delete 키

**Files:**
- Create: `src/features/room-editor/ui/editor-toolbar.tsx`
- Create: `src/features/room-editor/ui/properties-panel.tsx`
- Create: `src/features/room-editor/ui/use-editor-keyboard.ts`
- Modify: `src/features/room-editor/index.ts`
- Modify: `src/app/(admin)/admin/rooms/[roomId]/editor/room-editor-page.tsx`

**Interfaces:**
- Produces: `<EditorToolbar />`, `<PropertiesPanel />`, `useEditorKeyboard()`.

- [x] **Step 1: 구현**

`src/features/room-editor/ui/editor-toolbar.tsx`
```tsx
"use client";

import type { ObjectType } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";

const ITEMS: { type: ObjectType; label: string }[] = [
  { type: "seat", label: "+ Seat" },
  { type: "table", label: "+ Table" },
  { type: "wall", label: "+ Wall" },
];

/** PRD 4.2 Object Toolbar. 추가 위치는 스토어가 정한다(뷰포트 중심). */
export function EditorToolbar() {
  const addObject = useEditorStore((s) => s.addObject);
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs font-medium text-zinc-500">오브젝트</p>
      {ITEMS.map((item) => (
        <Button key={item.type} variant="secondary" size="sm" onClick={() => addObject(item.type)}>
          {item.label}
        </Button>
      ))}
    </div>
  );
}
```

`src/features/room-editor/ui/properties-panel.tsx`
```tsx
"use client";

import { type KeyboardEvent, type FocusEvent } from "react";
import { SEAT_STATUSES } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";
import { selectSelectedObject } from "../model/selectors";

const TYPE_LABEL = { seat: "좌석", table: "테이블", wall: "벽" } as const;

/**
 * 선택 오브젝트 속성 (PRD 4.2). 숫자 입력은 blur 또는 Enter 에서 커밋 → 타이핑 한 글자마다
 * 히스토리가 쌓이지 않는다. key 에 현재 값을 넣어 Undo 로 값이 바뀌면 입력창도 리셋된다.
 */
export function PropertiesPanel() {
  const object = useEditorStore(selectSelectedObject);
  const updateSelected = useEditorStore((s) => s.updateSelected);
  const rotateSelected = useEditorStore((s) => s.rotateSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  if (!object) {
    return <p className="p-3 text-sm text-zinc-500">오브젝트를 선택하세요.</p>;
  }

  const commitNumber =
    (field: "x" | "y" | "width" | "height") =>
    (e: FocusEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => {
      if ("key" in e && e.key !== "Enter") return;
      const value = Number((e.target as HTMLInputElement).value);
      if (Number.isFinite(value)) updateSelected({ [field]: Math.round(value) });
    };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs font-medium text-zinc-500">{TYPE_LABEL[object.type]} 속성</p>

      {object.type === "seat" ? (
        <>
          <Field label="이름" htmlFor="prop-name">
            <Input
              id="prop-name"
              key={`${object.id}-${object.seat.name}`}
              defaultValue={object.seat.name}
              maxLength={50}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name) updateSelected({ seatName: name });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </Field>
          <Field label="상태" htmlFor="prop-status">
            <select
              id="prop-status"
              value={object.seat.status}
              onChange={(e) =>
                updateSelected({ seatStatus: e.target.value as (typeof SEAT_STATUSES)[number] })
              }
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            >
              <option value="available">예약 가능</option>
              <option value="disabled">사용 불가</option>
            </select>
          </Field>
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <Field key={field} label={field.toUpperCase()} htmlFor={`prop-${field}`}>
            <Input
              id={`prop-${field}`}
              key={`${object.id}-${field}-${object[field]}`}
              type="number"
              defaultValue={object[field]}
              onBlur={commitNumber(field)}
              onKeyDown={commitNumber(field)}
            />
          </Field>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600">회전 {object.rotation}°</span>
        <Button variant="secondary" size="sm" onClick={() => rotateSelected(-1)} aria-label="반시계 회전">
          ↺
        </Button>
        <Button variant="secondary" size="sm" onClick={() => rotateSelected(1)} aria-label="시계 회전">
          ↻
        </Button>
      </div>

      <Button variant="danger" size="sm" onClick={deleteSelected}>
        삭제
      </Button>
    </div>
  );
}
```

`src/features/room-editor/ui/use-editor-keyboard.ts` (Task 5 버전: Delete 만. Task 6 에서 undo/redo 추가)
```ts
"use client";

import { useEffect } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/** 입력 중인 폼 요소에서는 단축키를 먹지 않는다 (PRD 부록: 입력창 포커스 중 Delete 무시). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useEditorKeyboard() {
  const store = useEditorStoreApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
```

`src/features/room-editor/index.ts` 에 추가:
```ts
export { EditorToolbar } from "./ui/editor-toolbar";
export { PropertiesPanel } from "./ui/properties-panel";
export { useEditorKeyboard } from "./ui/use-editor-keyboard";
```

`room-editor-page.tsx` (임시 조립 갱신)
```tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import {
  EditorCanvas,
  EditorStoreProvider,
  EditorToolbar,
  PropertiesPanel,
  useEditorKeyboard,
} from "@/features/room-editor";

function EditorBody() {
  useEditorKeyboard();
  return (
    <div className="grid h-[75vh] grid-cols-[140px_1fr_260px] rounded-lg border border-zinc-200 bg-white">
      <aside className="border-r border-zinc-200">
        <EditorToolbar />
      </aside>
      <EditorCanvas />
      <aside className="border-l border-zinc-200">
        <PropertiesPanel />
      </aside>
    </div>
  );
}

export function RoomEditorPage({ roomId }: { roomId: string }) {
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));
  return (
    <EditorStoreProvider layout={layout}>
      <EditorBody />
    </EditorStoreProvider>
  );
}
```

- [x] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 3: 브라우저 확인**

1. `+ Seat` 3번 → 화면 중심에 S2, S3, S4 (A1 이 있으니 count+1). 마지막 것이 선택됨.
2. 패널에서 이름 "창가1" 입력 후 Enter → 캔버스 라벨 변경. 상태 "사용 불가" → 회색.
3. X 에 `5` 입력 → 스냅 없이 5 로 이동(숫자 입력은 스냅 안 함), `-50` 은 0 으로 클램프.
4. ↻ 두 번 → 180°. 삭제 버튼 → 사라짐. 좌석 선택 후 Delete 키 → 삭제. 이름 입력창에 커서 두고 Backspace → 글자만 지워짐.

- [x] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(editor): 오브젝트 툴바, 속성 패널(이름·상태·위치·크기·회전·삭제), Delete 키"
```

---

### Task 6: Undo / Redo — 버튼 + 단축키

**Files:**
- Create: `src/features/room-editor/ui/history-controls.tsx`
- Modify: `src/features/room-editor/ui/use-editor-keyboard.ts` (전체 교체)
- Modify: `src/features/room-editor/index.ts`
- Modify: `room-editor-page.tsx` (상단 바 추가)

- [x] **Step 1: 구현**

`src/features/room-editor/ui/history-controls.tsx`
```tsx
"use client";

import { Button } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";
import { selectCanRedo, selectCanUndo } from "../model/selectors";

export function HistoryControls() {
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
        ↶ 실행 취소
      </Button>
      <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">
        ↷ 다시 실행
      </Button>
    </div>
  );
}
```

`src/features/room-editor/ui/use-editor-keyboard.ts` (전체 교체)
```ts
"use client";

import { useEffect } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/** 입력 중인 폼 요소에서는 단축키를 먹지 않는다 (PRD 부록: 입력창 포커스 중 Delete 무시). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * 단축키 (PRD 6.5, 7):
 * - Delete / Backspace : 선택 삭제
 * - Ctrl/Cmd + Z       : Undo
 * - Ctrl/Cmd + Shift+Z, Ctrl/Cmd + Y : Redo
 * Mac 은 metaKey, 그 외는 ctrlKey. 브라우저 기본 동작(뒤로가기 등)은 preventDefault.
 */
export function useEditorKeyboard() {
  const store = useEditorStoreApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.getState().redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.getState().deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
```

`index.ts` 에 `export { HistoryControls } from "./ui/history-controls";` 추가.

`room-editor-page.tsx` 의 `EditorBody` 를 아래로 교체:
```tsx
function EditorBody() {
  useEditorKeyboard();
  return (
    <div className="flex h-[80vh] flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex h-12 items-center gap-3 border-b border-zinc-200 px-3">
        <HistoryControls />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[140px_1fr_260px]">
        <aside className="border-r border-zinc-200">
          <EditorToolbar />
        </aside>
        <EditorCanvas />
        <aside className="border-l border-zinc-200 overflow-y-auto">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
```
(import 에 `HistoryControls` 추가)

- [x] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 3: 브라우저 확인**

1. 좌석 추가 → 드래그 → 회전 → 이름 변경. Ctrl+Z 4번: 이름 → 회전 → 위치(드래그 전 자리로 한 번에) → 추가 취소. Ctrl+Shift+Z 로 복구.
2. 버튼 disabled 상태가 past/future 와 맞는다. 이름 입력창에서 Ctrl+Z 는 브라우저 기본(텍스트 되돌리기)만.

- [x] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(editor): Undo/Redo 버튼과 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 단축키"
```

---

### Task 7: Zoom (휠, 커서 고정) + Pan (Space+드래그, 휠 클릭)

**Files:**
- Create: `src/features/room-editor/ui/use-canvas-wheel.ts`
- Create: `src/features/room-editor/ui/zoom-controls.tsx`
- Modify: `src/features/room-editor/ui/use-canvas-pointer.ts` (전체 교체: 팬 추가)
- Modify: `src/features/room-editor/ui/editor-canvas.tsx` (휠 훅 연결)
- Modify: `src/features/room-editor/index.ts`, `room-editor-page.tsx` (ZoomControls 배치)

- [ ] **Step 1: 구현**

`src/features/room-editor/ui/use-canvas-wheel.ts`
```ts
"use client";

import { useEffect, type RefObject } from "react";
import { useEditorStoreApi } from "../model/editor-store-provider";

/**
 * 휠 = 줌 (PRD 8.1). React 의 onWheel 은 passive 라 preventDefault 가 안 먹어 페이지가 스크롤된다.
 * 그래서 addEventListener(..., { passive: false }) 로 직접 등록한다.
 * 휠 1틱 = 1단계, 커서 위치의 캔버스 점 고정.
 */
export function useCanvasWheel(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const rect = el.getBoundingClientRect();
      store
        .getState()
        .zoomStep(e.deltaY < 0 ? 1 : -1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store, svgRef]);
}
```

`src/features/room-editor/ui/zoom-controls.tsx`
```tsx
"use client";

import { Button } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";

export function ZoomControls() {
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const zoomStep = useEditorStore((s) => s.zoomStep);
  const fitToScreen = useEditorStore((s) => s.fitToScreen);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => zoomStep(-1)} aria-label="축소">
        −
      </Button>
      <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="sm" onClick={() => zoomStep(1)} aria-label="확대">
        +
      </Button>
      <Button variant="ghost" size="sm" onClick={fitToScreen}>
        맞춤
      </Button>
    </div>
  );
}
```

`src/features/room-editor/ui/use-canvas-pointer.ts` (전체 교체)
```ts
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { screenToCanvas } from "../lib/geometry";
import { useEditorStoreApi } from "../model/editor-store-provider";
import type { Point } from "../model/types";

/**
 * 캔버스 포인터 제스처: 선택, 드래그, 팬.
 *
 * - 좌표: clientX/Y → svg 좌상단 기준 화면 좌표 → screenToCanvas → 캔버스 좌표
 * - 드래그: grabOffset(잡은 지점 - 좌상단) 을 기억, 매 move 마다 절대 위치 계산 (오차 누적 없음)
 * - 팬: Space 누른 채 드래그 또는 휠 클릭(button 1). 화면 좌표 delta 를 offset 에 더한다
 * Space 눌림은 스토어가 아니라 이 훅의 상태(D-23). 커서 표시용으로만 밖에 노출.
 */
export function useCanvasPointer(svgRef: RefObject<SVGSVGElement | null>) {
  const store = useEditorStoreApi();
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); // 페이지 스크롤 방지
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toScreen = useCallback(
    (e: ReactPointerEvent): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [svgRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      const screen = toScreen(e);
      e.currentTarget.setPointerCapture(e.pointerId);

      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        s.setInteraction({ type: "pan", lastScreen: screen });
        setIsPanning(true);
        return;
      }
      if (e.button !== 0) return;

      const target = (e.target as Element).closest("[data-object-id]");
      const id = target?.getAttribute("data-object-id") ?? null;
      if (!id) {
        s.select(null);
        return;
      }
      const object = s.document.objects[id];
      if (!object) return;

      const canvas = screenToCanvas(screen, s.viewport);
      s.select(id);
      s.beginGesture();
      s.setInteraction({
        type: "drag",
        id,
        grabOffset: { x: canvas.x - object.x, y: canvas.y - object.y },
      });
    },
    [store, toScreen, spaceHeld],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const s = store.getState();
      const it = s.interaction;
      if (it.type === "drag") {
        const canvas = screenToCanvas(toScreen(e), s.viewport);
        s.moveObject(it.id, { x: canvas.x - it.grabOffset.x, y: canvas.y - it.grabOffset.y });
      } else if (it.type === "pan") {
        const screen = toScreen(e);
        s.panBy(screen.x - it.lastScreen.x, screen.y - it.lastScreen.y);
        s.setInteraction({ type: "pan", lastScreen: screen });
      }
    },
    [store, toScreen],
  );

  const onPointerUp = useCallback(() => {
    const s = store.getState();
    if (s.interaction.type === "drag") s.endGesture();
    if (s.interaction.type !== "idle") s.setInteraction({ type: "idle" });
    setIsPanning(false);
  }, [store]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    isPanning,
    spaceHeld,
  };
}
```

`src/features/room-editor/ui/editor-canvas.tsx` 수정 — import 와 훅 호출, 커서 클래스:
```tsx
import { useCanvasWheel } from "./use-canvas-wheel";
// ...
  const { handlers, isPanning, spaceHeld } = useCanvasPointer(svgRef);
  useCanvasWheel(svgRef);
// ...
  const cursor = isPanning ? "cursor-grabbing" : spaceHeld ? "cursor-grab" : "";
  <svg ref={svgRef} className={`h-full w-full touch-none select-none bg-zinc-100 ${cursor}`} {...handlers}>
```

`index.ts` 에 `export { ZoomControls } from "./ui/zoom-controls";`. `room-editor-page.tsx` 상단 바에 `<HistoryControls />` 옆 `<ZoomControls />`.

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 브라우저 확인**

1. 좌석 위에 커서 두고 휠 업 → 그 좌석이 커서 아래 그대로 있으면서 확대. 표시 % 가 단계별로 변함. 페이지는 스크롤 안 됨.
2. Space 누르면 커서 grab, 드래그하면 캔버스 이동. 놓으면 원래 커서. 휠 클릭 드래그도 팬.
3. 팬/줌 후 `+ Seat` → 여전히 보이는 화면 중앙에 생성. "맞춤" → 처음 상태.
4. 줌 1.5 에서 드래그해도 오브젝트가 커서를 정확히 따라온다 (좌표 변환 검증).

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(editor): 휠 줌(커서 고정, 5단계), Space·휠클릭 팬, 줌 컨트롤"
```

---

### Task 8: 저장 + Dirty 표시 + 이탈 경고 + 버전 충돌 처리

**Files:**
- Create: `src/features/room-editor/api/mutations.ts`
- Create: `src/features/room-editor/ui/save-controls.tsx`
- Create: `src/features/room-editor/ui/use-unsaved-changes-guard.ts`
- Modify: `src/features/room-editor/index.ts`, `room-editor-page.tsx`

**Interfaces:**
- Consumes: `toSaveInput`, `roomKeys`, `roomQueries.layout`, `apiFetch`, `ApiError`, `SaveLayoutResultDto`.
- Produces: `useSaveLayout(): { save(): void; isPending: boolean }`, `useReloadFromServer(): { reload(): Promise<void>; isPending }`, `<SaveControls />`, `useUnsavedChangesGuard()`.

- [ ] **Step 1: 구현**

`src/features/room-editor/api/mutations.ts`
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/shared/api";
import type { SaveLayoutResultDto } from "@/shared/contracts";
import { roomKeys, roomQueries } from "@/entities/room";
import { toSaveInput } from "../lib/document";
import { useEditorStoreApi } from "../model/editor-store-provider";

/**
 * 저장 (PRD 10 명시적 Save). 흐름:
 *   saveStarted() → PUT { expectedVersion, objects } → saveSucceeded(version) | saveFailed(msg, 'conflict'|'error')
 * 문서는 어떤 경우에도 건드리지 않는다. 성공 후 layout/detail 쿼리를 무효화해 다른 화면(뷰어)이 새 데이터를 받게 한다.
 */
export function useSaveLayout() {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const { document, persistence } = store.getState();
      store.getState().saveStarted();
      return apiFetch<SaveLayoutResultDto>(`/api/rooms/${document.roomId}/layout`, {
        method: "PUT",
        body: toSaveInput(document, persistence.layoutVersion),
      });
    },
    onSuccess: async (result) => {
      store.getState().saveSucceeded(result.layoutVersion);
      const roomId = store.getState().document.roomId;
      await queryClient.invalidateQueries({ queryKey: roomKeys.layout(roomId) });
      await queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        store.getState().saveFailed(error.message, "conflict");
        return;
      }
      const message = error instanceof ApiError ? error.message : "저장에 실패했습니다.";
      store.getState().saveFailed(message, "error");
    },
  });

  return { save: () => mutation.mutate(), isPending: mutation.isPending };
}

/** 충돌 시 "서버 버전 불러오기". refetch → replaceDocument (충돌 교체 1회 접점). */
export function useReloadFromServer() {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const roomId = store.getState().document.roomId;
      return queryClient.fetchQuery({ ...roomQueries.layout(roomId), staleTime: 0 });
    },
    onSuccess: (layout) => store.getState().replaceDocument(layout),
  });

  return { reload: () => mutation.mutateAsync().then(() => undefined), isPending: mutation.isPending };
}
```

`src/features/room-editor/ui/save-controls.tsx`
```tsx
"use client";

import { Button } from "@/shared/ui";
import { useReloadFromServer, useSaveLayout } from "../api/mutations";
import { useEditorStore } from "../model/editor-store-provider";
import { selectIsDirty, selectSaveStatus } from "../model/selectors";

/**
 * 헤더 우측: 상태 표시 + 저장 버튼 (PRD 9). 충돌이면 두 갈래 선택지를 인라인으로 보여준다.
 */
export function SaveControls() {
  const isDirty = useEditorStore(selectIsDirty);
  const status = useEditorStore(selectSaveStatus);
  const error = useEditorStore((s) => s.persistence.error);
  const dismiss = useEditorStore((s) => s.dismissSaveError);
  const { save, isPending } = useSaveLayout();
  const { reload, isPending: reloading } = useReloadFromServer();

  if (status === "conflict") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-amber-700">{error}</span>
        <Button variant="secondary" size="sm" onClick={reload} disabled={reloading}>
          {reloading ? "불러오는 중..." : "서버 버전 불러오기"}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          계속 편집
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {status === "error" ? <span className="text-red-600">{error}</span> : null}
      {status === "saving" ? (
        <span className="text-zinc-500">저장 중...</span>
      ) : isDirty ? (
        <span className="text-amber-600">● 저장되지 않은 변경사항</span>
      ) : (
        <span className="text-green-700">✓ 저장됨</span>
      )}
      <Button size="sm" onClick={save} disabled={!isDirty || isPending}>
        {status === "error" ? "다시 시도" : "저장"}
      </Button>
    </div>
  );
}
```

`src/features/room-editor/ui/use-unsaved-changes-guard.ts`
```ts
"use client";

import { useEffect } from "react";
import { useEditorStore } from "../model/editor-store-provider";
import { selectIsDirty } from "../model/selectors";

/**
 * dirty 상태에서 새로고침/탭 닫기/외부 이동 시 브라우저 확인창 (PRD 9 이탈 경고).
 * 앱 내 Link 이동은 Next 가 라우터 이벤트를 제공하지 않으므로 "← 목록" 링크에서 confirm 으로 처리한다(Task 9).
 */
export function useUnsavedChangesGuard() {
  const isDirty = useEditorStore(selectIsDirty);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 커스텀 문구를 무시하지만 returnValue 설정이 확인창을 띄우는 조건
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

`index.ts` 에 추가:
```ts
export { SaveControls } from "./ui/save-controls";
export { useUnsavedChangesGuard } from "./ui/use-unsaved-changes-guard";
export { useSaveLayout, useReloadFromServer } from "./api/mutations";
```
`room-editor-page.tsx` 의 `EditorBody` 에 `useUnsavedChangesGuard();` 호출과 상단 바 우측 `<SaveControls />` (`ml-auto`).

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 브라우저 확인**

1. 진입 직후 "✓ 저장됨". 좌석 이동 → "● 저장되지 않은 변경사항", 저장 버튼 활성. Ctrl+Z 로 원위치 → 다시 "✓ 저장됨"(참조 비교).
2. 저장 → "저장 중..." → "✓ 저장됨". 새로고침 → 배치 유지 (PRD 20절 시스템 조건).
3. 충돌 재현: 탭 A, B 에서 같은 에디터 열기. A 에서 저장. B 에서 이동 후 저장 → 충돌 문구 + "서버 버전 불러오기 / 계속 편집". 불러오기 → A 의 배치로 교체, Undo 비활성. "계속 편집" 후 다시 저장하면 또 충돌(버전 그대로) — 의도된 동작.
4. dirty 상태에서 새로고침 → 브라우저 확인창.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(editor): 저장 mutation, Dirty 표시, 이탈 경고, 버전 충돌 시 서버 버전 불러오기"
```

---

### Task 9: 에디터 페이지 조립 (widget) + 데스크톱 전용 안내

**Files:**
- Create: `src/widgets/room-editor/ui/editor-shell.tsx`, `src/widgets/room-editor/index.ts`
- Modify: `src/app/(admin)/admin/rooms/[roomId]/editor/room-editor-page.tsx` (임시 조립 제거, widget 사용)

- [ ] **Step 1: 구현**

`src/widgets/room-editor/ui/editor-shell.tsx`
```tsx
"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { roomQueries } from "@/entities/room";
import {
  EditorCanvas,
  EditorStoreProvider,
  EditorToolbar,
  HistoryControls,
  PropertiesPanel,
  SaveControls,
  ZoomControls,
  selectIsDirty,
  useEditorKeyboard,
  useEditorStore,
  useUnsavedChangesGuard,
} from "@/features/room-editor";

/** "← 목록" : dirty 면 confirm. Next 라우터 이벤트가 없어 링크에서 직접 막는다. */
function BackLink({ roomId }: { roomId: string }) {
  const isDirty = useEditorStore(selectIsDirty);
  return (
    <Link
      href={`/admin/rooms/${roomId}`}
      className="text-sm text-zinc-600 hover:text-zinc-900"
      onClick={(e) => {
        if (isDirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 페이지를 나가시겠습니까?")) {
          e.preventDefault();
        }
      }}
    >
      ← 공간 정보
    </Link>
  );
}

function EditorLayout({ roomId, roomName }: { roomId: string; roomName: string }) {
  useEditorKeyboard();
  useUnsavedChangesGuard();
  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col rounded-lg border border-zinc-200 bg-white">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-200 px-3">
        <BackLink roomId={roomId} />
        <h1 className="truncate font-medium">{roomName}</h1>
        <HistoryControls />
        <ZoomControls />
        <div className="ml-auto">
          <SaveControls />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[140px_1fr_260px]">
        <aside className="border-r border-zinc-200">
          <EditorToolbar />
        </aside>
        <EditorCanvas />
        <aside className="overflow-y-auto border-l border-zinc-200">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}

/**
 * PRD 4.2 레이아웃. room 과 layout 은 페이지가 prefetch 해 두어 캐시 hit.
 * 모바일 Editor 는 범위 밖(PRD 부록) → md 미만에서는 안내만.
 */
export function EditorShell({ roomId }: { roomId: string }) {
  const { data: room } = useSuspenseQuery(roomQueries.detail(roomId));
  const { data: layout } = useSuspenseQuery(roomQueries.layout(roomId));

  return (
    <>
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 md:hidden">
        에디터는 데스크톱 화면에서 사용할 수 있습니다.
      </div>
      <div className="hidden md:block">
        <EditorStoreProvider layout={layout}>
          <EditorLayout roomId={roomId} roomName={room.name} />
        </EditorStoreProvider>
      </div>
    </>
  );
}
```

`src/widgets/room-editor/index.ts`
```ts
export { EditorShell } from "./ui/editor-shell";
```

`src/app/(admin)/admin/rooms/[roomId]/editor/room-editor-page.tsx` (전체 교체)
```tsx
"use client";

import { EditorShell } from "@/widgets/room-editor";

export function RoomEditorPage({ roomId }: { roomId: string }) {
  return <EditorShell roomId={roomId} />;
}
```
(page.tsx 는 Task 4 것 유지. `(admin)` 레이아웃의 `max-w-6xl px-4 py-6` 안에서 렌더된다.)

- [ ] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 3: 브라우저 최종 확인 (PRD 20절 관리자 흐름)**

1. `/admin/rooms/<id>` → "에디터 열기" → 헤더에 room 이름, 실행취소/다시실행, 줌, 저장 상태.
2. Seat/Table/Wall 추가 → 드래그 → 회전 → 삭제 → Undo/Redo → Zoom/Pan → 저장 → 새로고침 후 유지.
3. dirty 상태에서 "← 공간 정보" → confirm. 취소하면 머무름.
4. 창 폭 700px → 데스크톱 안내 문구.
5. 좌석 20개 이상 배치 후 드래그 프레임 드랍 없음 (성공 기준 1).

- [ ] **Step 4: 커밋 + 결정 기록**

`docs/decisions.md` 에 추가:
```
### D-43 · 2026-09-15 · 확정 — 에디터 조립은 widgets/room-editor, 페이지는 prefetch 만
- 페이지(RSC)가 room + layout 을 fetchQuery 로 prefetch → HydrationBoundary → widget 이 useSuspenseQuery 로 캐시 hit.
- EditorStoreProvider 는 widget 안에서 1회 생성. refetch 가 편집 문서를 덮지 않는다.
```

```bash
git add -A
git commit -m "feat(editor): 에디터 페이지 조립 - 헤더/툴바/캔버스/패널 widget, 이탈 confirm, 데스크톱 전용 안내"
```

---

## Self-Review 결과

- 스펙 커버리지: 6절 layout GET/PUT ✓(T1), 8절 무효화 표 layout 행 ✓(T8), 9절 문서·상태·액션·순수 로직·렌더링 방식 ✓(T2~T4), 9절 `settings.gridSize/snapToGrid` ✓, 10절 저장·충돌·이탈 ✓(T8, T9), PRD 6.1~6.5 ✓(T4, T5), 7 Undo/Redo + 단축키 ✓(T6), 8 Zoom 단계·휠·Space 팬 ✓(T7), 9 Dirty UI 문구("● 저장되지 않은 변경사항", "✓ 저장됨") ✓(T8), 부록 세부(스냅 10, 단일 선택, 뷰포트 중심, 입력창 Delete 무시) ✓.
- 타입 일관성: `Interaction.drag.grabOffset` (T2 정의 → T4/T7 사용), `ObjectPatch.seatName/seatStatus` (T2 → T3/T5), `zoomStep(direction, anchorScreen?)` (T2 → T3/T7), `saveFailed(message, status)` (T2 → T3/T8), `roomQueries.layout` (T1 → T4/T8/T9). `EditorStoreProvider({ layout })` 시그니처 T3 → T4/T9 동일.
- 남은 위험: (1) PostgREST 1:1 조인 타입 — `select("*, seats(*)")` 결과를 `SpaceObjectRowWithSeat[]` 로 단언. 생성 타입에 `isOneToOne: true` 확인됨. (2) `crypto.randomUUID` 는 브라우저·Node 18+ 전역. Vitest node 환경 OK. (3) `e.returnValue = ""` 는 deprecated 경고가 뜰 수 있으나 확인창 트리거에 아직 필요.
- Plan A 와의 접점: `roomQueries` 에 `layout` 추가 외 기존 파일 수정 없음.
