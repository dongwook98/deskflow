import type { SpaceObjectDto } from "@/shared/contracts";
import type { EditorStore } from "./types";

// 파생 상태. 새 객체/배열을 만들지 않는 것만 여기 둔다 (useEditorStore 의 참조 비교와 맞물림).
export const selectIsDirty = (s: EditorStore) => s.document !== s.persistence.savedDocument;
export const selectCanUndo = (s: EditorStore) => s.history.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.history.future.length > 0;
export const selectSaveStatus = (s: EditorStore) => s.persistence.status;
export const selectSelectedObject = (s: EditorStore): SpaceObjectDto | null =>
  s.selectedObjectId ? (s.document.objects[s.selectedObjectId] ?? null) : null;
