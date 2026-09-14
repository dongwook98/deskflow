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
