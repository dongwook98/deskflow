"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api";
import { createRoomSchema, type RoomDto } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useCreateRoom, useUpdateRoom } from "../api/mutations";

type Props = { mode: "create" } | { mode: "edit"; room: RoomDto };

/**
 * 생성/수정 공용 폼. 두 훅을 모두 호출하는 이유: 훅은 조건부로 호출할 수 없다.
 * edit 이 아닐 때 useUpdateRoom("") 은 실행되지 않는 mutation 객체일 뿐이라 무해하다.
 */
export function RoomForm(props: Props) {
  const create = useCreateRoom();
  const update = useUpdateRoom(props.mode === "edit" ? props.room.id : "");
  const mutation = props.mode === "create" ? create : update;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const initial = props.mode === "edit" ? props.room : null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = createRoomSchema.safeParse({
      name: form.get("name"),
      description: form.get("description") ?? "",
      width: Number(form.get("width")),
      height: Number(form.get("height")),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFieldError(first ? `${first.path.join(".")}: ${first.message}` : "입력을 확인하세요.");
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  }

  const serverError = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial?.name} required maxLength={100} />
      </Field>
      <Field label="설명" htmlFor="description">
        <Input
          id="description"
          name="description"
          defaultValue={initial?.description}
          maxLength={500}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="캔버스 너비 (px)" htmlFor="width">
          <Input
            id="width"
            name="width"
            type="number"
            min={200}
            max={10000}
            defaultValue={initial?.width ?? 1200}
            required
          />
        </Field>
        <Field label="캔버스 높이 (px)" htmlFor="height">
          <Input
            id="height"
            name="height"
            type="number"
            min={200}
            max={10000}
            defaultValue={initial?.height ?? 800}
            required
          />
        </Field>
      </div>
      {fieldError ? <p className="text-sm text-red-600">{fieldError}</p> : null}
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      {mutation.isSuccess && props.mode === "edit" ? (
        <p className="text-sm text-green-700">저장됨</p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending}>
        {props.mode === "create" ? "공간 만들기" : "저장"}
      </Button>
    </form>
  );
}
