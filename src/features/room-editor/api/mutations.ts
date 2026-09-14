"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/shared/api";
import type { SaveLayoutResultDto } from "@/shared/contracts";
import { roomKeys, roomQueries } from "@/entities/room";
import { toSaveInput } from "../lib/document";
import { useEditorStoreApi } from "../model/editor-store-provider";

/**
 * 저장 (PRD 10 명시적 Save). 흐름:
 *   saveStarted() → PUT { expectedVersion, objects } → saveSucceeded(version) | saveFailed(msg, 'conflict'|'error')
 * 문서는 어떤 경우에도 건드리지 않는다. 성공 후 layout/detail 쿼리를 무효화해 다른 화면(뷰어)이 새 데이터를 받게 한다.
 */
export function useSaveLayout() {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const { document, persistence } = store.getState();
      store.getState().saveStarted();
      return apiFetch<SaveLayoutResultDto>(`/api/rooms/${document.roomId}/layout`, {
        method: "PUT",
        body: toSaveInput(document, persistence.layoutVersion),
      });
    },
    onSuccess: async (result) => {
      store.getState().saveSucceeded(result.layoutVersion);
      const roomId = store.getState().document.roomId;
      await queryClient.invalidateQueries({ queryKey: roomKeys.layout(roomId) });
      await queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        store.getState().saveFailed(error.message, "conflict");
        return;
      }
      const message = error instanceof ApiError ? error.message : "저장에 실패했습니다.";
      store.getState().saveFailed(message, "error");
    },
  });

  return { save: () => mutation.mutate(), isPending: mutation.isPending };
}

/** 충돌 시 "서버 버전 불러오기". refetch → replaceDocument (충돌 교체 1회 접점). */
export function useReloadFromServer() {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const roomId = store.getState().document.roomId;
      // staleTime 0: 캐시가 신선해 보여도 반드시 서버에서 다시 받는다
      return queryClient.fetchQuery({ ...roomQueries.layout(roomId), staleTime: 0 });
    },
    onSuccess: (layout) => store.getState().replaceDocument(layout),
  });

  return {
    reload: () => mutation.mutateAsync().then(() => undefined),
    isPending: mutation.isPending,
  };
}
