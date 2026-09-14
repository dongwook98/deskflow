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
