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
    const o = s.document.objects[id];
    expect(o?.type === "seat" && o.seat.name).toBe("S1");
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
