@AGENTS.md

# DeskFlow

관리자가 공간 레이아웃을 편집하고 사용자가 좌석을 예약하는 서비스. 핵심은 Interactive Space Editor.

- 요구사항: `PRD.md` (원문 + 부록 「확정 사항」. 충돌 시 부록 우선)
- 설계: `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md`
- 결정 기록: `docs/decisions.md` (결정 바뀌면 폐기 표시 후 새 번호 추가)

## 명령
```bash
pnpm dev          # 개발 서버
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint (레이어 경계 검사 포함)
pnpm test         # vitest run
pnpm build
supabase db push  # supabase/migrations 적용 (link 필요)
```
Node 는 `pnpm-workspace.yaml` 의 `useNodeVersion` 으로 고정(Vercel 은 `engines.node`). 세 검사(typecheck/lint/test) 통과 전엔 단계 완료 아님.

## 구조
```
src/app/api/_server/   백엔드. Supabase 를 아는 유일한 곳(+ proxy.ts). 서비스·인증·검증·에러 매핑
src/app/api/**/route.ts   얇은 Route Handler: requireUser/Admin → parse → service → 응답
src/app/(pages)        라우트만. widgets/features 조합
src/widgets            페이지 블록 (room-editor, room-viewer ...)
src/features           사용자 행동 (room-editor 상태·조작, reservation-create ...)
src/entities           도메인 조회: query-keys + queryOptions
src/shared/contracts   서버·클라 공유 DTO + zod. API 명세 그 자체
src/shared/api         apiFetch, queryClient, provider
supabase/migrations    DB 단일 진실. 기존 파일 수정 금지, 새 파일 추가
```
의존 방향: `route.ts → _server → shared`, `app → widgets → features → entities → shared`. 프론트 레이어는 `_server` 를 import 할 수 없다. ESLint 가 막는다.

## 규칙
- Server Action 사용 안 함. 쓰기와 클라이언트 읽기는 전부 `/api/*`.
- 서버 prefetch 도 `/api` 를 호출한다(`serverFetchContext` 로 origin + cookie 전달). RSC 가 `_server` 를 직접 호출하지 않는다.
- 응답: 성공은 `T` 그대로, 실패는 `{ error: { code, message } }` + 4xx/5xx.
- 프론트 타입은 `shared/contracts` 의 DTO 그대로. 에디터만 `EditorDocument` 로 변환.
- 에디터 스토어는 `EditorStoreProvider` 로 인스턴스 생성. 전역 싱글톤 금지. 문서 변경은 항상 새 객체(참조 비교로 Dirty/Undo 판단).
- 서버 상태(TanStack Query)와 에디터 상태(Zustand) 접점은 로드·저장·충돌 교체 세 곳뿐.
- 예약 충돌은 DB exclusion constraint 가 최종. 앱은 `23P01` 을 409 로 매핑만.
- env 는 사용하는 함수 안에서 검증. 모듈 import 시점 parse 금지.
- 에디터 순수 로직(geometry, history, document)과 서비스 함수는 테스트 필수.
- 라이브러리 추가 전 이유를 말한다. PRD 밖 기능은 먼저 제안한다.
- 단계마다 제안 → 컨펌 → 구현 → 검증 보고. 컨펌 없이 다음 단계로 넘어가지 않는다.
