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
