"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { LayoutDto } from "@/shared/contracts";
import { createEditorStore, type EditorStoreApi } from "./store";
import type { EditorStore } from "./types";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface Props {
  /** 마운트 시 1회만 읽는다. 이후 TanStack Query 가 refetch 해도 스토어는 반응하지 않는다(의도). */
  layout: LayoutDto;
  children: ReactNode;
}

export function EditorStoreProvider({ layout, children }: Props) {
  const [store] = useState(() => createEditorStore({ layout }));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStoreApi(): EditorStoreApi {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error("useEditorStoreApi 는 EditorStoreProvider 안에서만 사용할 수 있습니다.");
  }
  return store;
}

/** selector 결과가 바뀔 때만 리렌더. 객체/배열을 새로 만드는 selector 는 피한다. */
export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
