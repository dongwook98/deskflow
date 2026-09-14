# DeskFlow 의사결정 기록

형식: 번호 · 날짜 · 상태(확정 / 보류 / 폐기). 각 항목은 결정, 대안, 이유, 반영 위치. 나중에 뒤집으면 폐기 표시하고 새 번호로 추가한다. 관련 문서: `PRD.md`(부록), `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md`.

---

## 범위

### D-01 · 2026-09-14 · 확정 — 2일 MVP 범위 절단
- 결정: Auth, Room CRUD, Editor 전체, 예약 전체, 배포, README, Vitest 포함. 모바일 Editor(Bottom Sheet), Playwright E2E, 리사이즈 핸들, 다중 선택, 자유 회전 제외.
- 대안: PRD Phase 1~5 전부(추정 4일). 에디터만 깊게 + 예약 축소. 배포 우선.
- 이유: 사용자 요구 "2일 내 셋 다(에디터 완성도 + 끝까지 이어지는 흐름 + 배포)". 각 영역을 얇게 유지해야 가능.
- 반영: PRD 부록 「범위」, 스펙 1절.

---

## 기술 스택

### D-02 · 확정 — dnd-kit 제외, Pointer Events 직접 구현
- 대안: dnd-kit.
- 이유: dnd-kit 은 DOM 리스트/정렬용. 화면 px delta 만 제공하므로 zoom/pan 역변환은 어차피 직접. 포트폴리오 질문 1, 2번(좌표 변환)을 직접 소유해야 설명 가능. 코드도 더 적음.
- 반영: PRD 부록, 스펙 2절·9절.

### D-03 · 확정 — Supabase Realtime 제외
- 이유: 실시간 공동 편집은 PRD 가 명시적으로 제외. 예약 현황 실시간 갱신도 MVP 목록에 없음. 가용성 쿼리 staleTime 15초 + 창 포커스 refetch 로 대체.
- 반영: PRD 부록, 스펙 8절.

### D-04 · 확정 — shadcn/ui, React Hook Form 제외
- 이유: 폼 3개(로그인, Room, 예약), 컴포넌트 10개 미만. init/학습 비용이 이득보다 큼. Tailwind 직접 + zod 검증.
- 반영: PRD 부록, 스펙 2절.

### D-05 · 확정 — Playwright 는 Phase 5 이후
- 이유: 2일 범위. 예약 충돌은 DB 통합 테스트 1개로 대체.
- 반영: 스펙 12절.

### D-06 · 확정 — 캔버스 렌더링 SVG
- 대안: HTML div 절대 배치, Canvas 2D.
- 이유: 요소 단위 포인터 이벤트, `transform` 으로 회전·줌·팬, 수백 개까지 성능 문제 없음. 문서 모델(EditorDocument)이 렌더러와 독립이라 대량 시 Canvas 전환 가능.
- 반영: 스펙 9절 렌더링.

### D-07 · 확정 — 타입 검사 TypeScript strict + `noUncheckedIndexedAccess`
- 이유: `Record<id, obj>[id]` 접근이 많음. undefined 를 강제로 다루게 해서 런타임 에러 예방.

---

## 서버 통신

### D-08 · 확정 — Server Action 미사용, Route Handler(`/api/*`) 사용
- 대안: Server Action.
- 이유: HTTP 계약이 명시적(curl/테스트 가능), 상태 코드로 409 같은 의미 전달, TanStack Query 와 자연스러운 짝, 백엔드 교체 지점 명확.
- 비용: 요청 파싱/응답/fetch 래퍼 보일러플레이트. `_server/http/*` 와 `shared/api/http.ts` 로 흡수.
- 반영: 스펙 3·4·6절.

### D-09 · 확정 — 백엔드 코드는 `src/app/api/_server/**` 에 격리
- 대안: `src/server/`, 각 entities 안에 서버 코드 혼재.
- 이유: 사용자 요구 "Route Handler 폴더 안에서 분리". `_` 접두 폴더는 Next 라우팅 제외. Supabase 를 아는 파일은 이 폴더와 `proxy.ts` 뿐. ESLint boundaries 로 프론트 레이어의 import 차단.
- 반영: 스펙 4절.

### D-10 · 확정 — 서버 prefetch 도 `/api` 를 호출 (대안 B)
- 대안 A: RSC 가 `_server` 서비스 함수를 직접 호출(HTTP 생략, queryFn 두 벌).
- 이유: 사용자 선택. queryFn 한 벌, 프론트가 Supabase 를 전혀 모름.
- 비용: 서버가 자기 자신에게 HTTP 1회, 절대 URL(`getSiteOrigin`) 과 쿠키 수동 전달(`serverFetchContext`) 필요. Vercel 프리뷰 Deployment Protection 과 충돌 가능(D-22 보류).
- 반영: 스펙 8절.

### D-11 · 확정 — 인증도 `/api/auth/*` 경유
- 대안: 브라우저에서 `createBrowserClient` 로 Supabase Auth 직접 호출.
- 이유: 프론트가 Supabase 를 모른다는 원칙 유지. 서버 클라이언트가 `signInWithPassword` 후 Set-Cookie.
- 반영: 스펙 6절·10절.

### D-12 · 확정 — 응답 봉투 없음. 성공 `T`, 실패 `{ error: { code, message } }`
- 대안: `{ data: T }` 봉투.
- 이유: Stripe/GitHub 관례. 상태 코드가 성공/실패 구분. `apiFetch` 가 `!ok` 면 throw 하므로 TanStack Query 와 맞음.
- 반영: 스펙 6절.

### D-13 · 확정 — 예약 취소는 `POST /api/reservations/:id/cancel`
- 대안: `PATCH { status: 'cancelled' }`, `DELETE`.
- 이유: 상태 전이는 동사 서브리소스가 관례(Stripe, Google API 가이드). soft delete 라 DELETE 부적합.
- 반영: 스펙 6절.

### D-14 · 확정 — 레이아웃 저장 버전은 body `expectedVersion`
- 대안: `If-Match` 헤더.
- 이유: 앱 API 관례. ETag 인프라 없음.

### D-15 · 확정 — 프론트 도메인 타입 = DTO. 에디터만 별도 모델
- 대안: 전 계층 매핑(DTO → 도메인).
- 이유: DTO 를 우리가 설계해 이미 UI 친화적. 매핑 필요 시 `entities/*/api/queries.ts` 의 `select` 한 곳에 도입. 에디터는 정규화·불변 갱신 필요해서 `EditorDocument` + `fromLayoutDto/toSaveInput`.
- 반영: 스펙 7절.

---

## 서버 상태

### D-16 · 확정 — TanStack Query 유지, 서버 prefetch + HydrationBoundary
- 대안: RSC 직접 fetch + `router.refresh()` (Server Action 시절 검토안).
- 이유: Server Action 을 뺀 뒤 mutation/invalidate 관리가 필요. PRD 11.2 와 일치. 사용자 요구.
- 세부: 기본 staleTime 60초(hydrate 직후 refetch 방지). 가용성만 15초 + 창 포커스 refetch. 낙관적 업데이트 없음.
- 반영: 스펙 8절.

---

## 에디터 상태

### D-17 · 확정 — 문서 = `{ objects: Record<id, obj>, order: id[] }` 불변 스냅샷
- 대안: 배열 하나.
- 이유: id 조회 O(1), `order` 가 z 순서(저장 시 index → zIndex). 변경마다 새 객체 → 참조 비교 가능.

### D-18 · 확정 — 히스토리는 스냅샷 방식, 드래그 1회 = 1단계, 상한 100
- 대안: 커맨드 패턴(역연산).
- 이유: 문서 작고 구현 단순. `beginGesture / moveObject×n / endGesture` 로 드래그 중 mousemove 는 기록 안 함.

### D-19 · 확정 — Dirty = `document !== savedDocument` 참조 비교
- 대안: boolean 플래그.
- 이유: Undo 로 저장 시점까지 되돌리면 자동 clean. 플래그는 이 경우 오작동.

### D-20 · 확정 — 저장 중 편집 허용, `inFlightDocument` 로 요청 시점 문서 보관
- 대안: 저장 중 에디터 잠금.
- 이유: 저장 성공 시 요청 시점 문서만 saved 처리. 저장 중 편집은 dirty 로 남음.

### D-21 · 확정 — 충돌(409) 시 `replaceDocument` 가 히스토리 초기화
- 이유: 서버 문서로 교체하면 이전 히스토리는 다른 기준선. 유지하면 undo 가 충돌 전 상태로 돌아가 혼란.

### D-23 · 확정 — Space 키 눌림은 스토어 밖(훅 로컬 ref)
- 대안: 스토어 `spaceHeld`.
- 이유: 일시적 입력 상태는 스토어에 두지 않는 관례. 커서 표시는 `interaction.type === 'pan'` 으로.

### D-24 · 확정 — 에디터 세부 UX
- 새 오브젝트 = 뷰포트 중심. 그리드 스냅 10px. 단일 선택. 회전 90° 단위·중심 기준·크기 스왑 없음. 크기 수정은 숫자 입력. Zoom 은 휠 1틱 = 1단계(50/75/100/125/150), 커서 고정. Pan = Space+드래그. 입력창 포커스 중 Delete 무시.
- 반영: PRD 부록, 스펙 9절.

---

## 데이터

### D-25 · 확정 — `seats` 테이블 분리 (space_objects 1:1)
- 대안: 단일 테이블 + nullable name/status.
- 이유: `reservations.seat_id → seats.id` FK 만으로 "좌석에만 예약" 보장. 좌석 속성 확장 자유. 포트폴리오 질문 8번.
- 비용: 레이아웃 저장이 두 테이블 → RPC `save_room_layout` 한 트랜잭션.

### D-26 · 확정 — `users` 대신 `profiles`(auth.users 1:1)
- 이유: Supabase 가 auth.users 관리. email 중복 저장 불필요. 트리거로 가입 시 자동 생성.

### D-27 · 확정 — rooms 에 `width`, `height`, `layout_version` 추가, `image_url` 제거
- 이유: 캔버스 크기 없이는 경계·기본 좌표 불가. `layout_version` 은 동시 저장 충돌 감지. 파일 업로드 범위 밖.

### D-28 · 확정 — space_objects 에 `z_index` 추가
- 이유: 테이블 위 좌석 겹침 순서.

### D-29 · 확정 — 예약 충돌은 Postgres exclusion constraint
- `EXCLUDE USING gist (seat_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status = 'reserved')`
- 대안: select-then-insert 앱 검사.
- 이유: 동시 요청도 DB 가 직렬화. 앱은 `23P01` 을 409 로 매핑만. 포트폴리오 질문 6, 7번.

### D-30 · 확정 — 예약 세부
- 30분 단위, 운영 09:00~22:00 상수, 과거 불가. 흐름은 날짜/시간 → 좌석(가용성 색 표시) → 예약. 일반 사용자는 남의 예약 행 못 읽음, 가용성은 점유 seat_id 만 RPC 로.
- 대안: PRD 원문 순서(좌석 → 날짜 → 시간). 좌석 고를 때 가용 여부를 모르는 문제.

### D-31 · 확정 — 명시적 저장 + 버전 충돌 감지
- 이유: PRD 10절. 편집 중간 상태가 서버에 안 감. 관리자 둘이 같은 room 저장 시 마지막 저장이 조용히 덮어쓰는 문제를 `layout_version` 으로 차단.

---

## 운영

### D-32 · 확정 — env 검증은 lazy
- 이유: 이전 시도에서 `proxy.ts` 가 import 시점에 zod parse → 키 이름 다르면 전 요청 500. 사용하는 함수 안에서 검증, 메시지에 키 이름 포함.

### D-33 · 확정 — 타임존
- 서버는 UTC, DB 는 timestamptz. "오늘", 30분 슬롯 계산은 클라이언트. 표시는 Asia/Seoul.

### D-34 · 확정 — 첫 admin 은 SQL 로 수동 승격
- `update profiles set role = 'admin' where id = '<uuid>'`. README 에 명시.

### D-35 · 확정 — Supabase 이메일 확인 비활성 권장
- 이유: 켜져 있으면 가입 후 메일 인증 전 로그인 불가. MVP 테스트 마찰.

### D-36 · 확정 — 결정 기록은 이 파일에 단계마다 누적, README 는 마지막에 정리

---

### D-22 · 확정 — Vercel 은 프로덕션 배포만 사용
- 영향: D-10(B 패턴)의 프리뷰 Deployment Protection 문제 없음. `NEXT_PUBLIC_SITE_URL` 은 프로덕션 도메인 하나만 설정.

### D-37 · 확정 — 마이그레이션은 Supabase CLI 로 적용
- `supabase link --project-ref <ref>` 후 `supabase db push`. `supabase/migrations/*.sql` 이 단일 진실. 대시보드 SQL Editor 직접 수정 금지.

---

## 보류 (답 필요)

(없음)

---

## 폐기

(없음)
