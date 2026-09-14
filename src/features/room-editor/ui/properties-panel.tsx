"use client";

import type { FocusEvent, KeyboardEvent } from "react";
import type { SeatStatus } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useEditorStore } from "../model/editor-store-provider";
import { selectSelectedObject } from "../model/selectors";

const TYPE_LABEL = { seat: "좌석", table: "테이블", wall: "벽" } as const;
const NUMBER_FIELDS = ["x", "y", "width", "height"] as const;

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
    (field: (typeof NUMBER_FIELDS)[number]) =>
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
              onChange={(e) => updateSelected({ seatStatus: e.target.value as SeatStatus })}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            >
              <option value="available">예약 가능</option>
              <option value="disabled">사용 불가</option>
            </select>
          </Field>
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {NUMBER_FIELDS.map((field) => (
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => rotateSelected(-1)}
          aria-label="반시계 회전"
        >
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
