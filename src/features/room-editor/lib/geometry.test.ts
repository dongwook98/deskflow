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
