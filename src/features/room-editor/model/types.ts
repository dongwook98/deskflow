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
