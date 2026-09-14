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
export function createObject({
  type,
  roomId,
  center,
  zIndex,
  seatName,
}: CreateObjectArgs): SpaceObjectDto {
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
