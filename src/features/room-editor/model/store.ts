import { createStore } from "zustand/vanilla";
import type { LayoutDto } from "@/shared/contracts";
import {
  DEFAULT_OBJECT_SIZE,
  createObject,
  fromLayoutDto,
  insertObject,
  nextSeatName,
  patchObject,
  removeObject,
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
        // 크기는 최소 10px. 위치는 새 크기 기준으로 클램프 (숫자 입력은 스냅하지 않는다)
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
            selectedObjectId && selectedObjectId in result.document.objects
              ? selectedObjectId
              : null,
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
            selectedObjectId && selectedObjectId in result.document.objects
              ? selectedObjectId
              : null,
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
