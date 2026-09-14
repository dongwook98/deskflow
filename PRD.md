# DeskFlow

> 공간 레이아웃을 직접 편집하고 좌석을 예약할 수 있는 공간 관리 서비스

---

## 1. 프로젝트 개요

### 1.1 서비스 한 줄 소개

관리자가 공간의 좌석과 오브젝트를 자유롭게 배치하고, 사용자는 실제 공간 레이아웃을 확인하며 원하는 좌석을 예약할 수 있는 공간 관리 서비스.

### 1.2 핵심 가치

DeskFlow의 핵심은 단순한 좌석 예약이 아니라 **Interactive Space Editor**다.

관리자는 별도의 이미지 편집 도구 없이 웹에서 공간을 직접 구성할 수 있다.

```text
공간 생성
  ↓
좌석 / 테이블 / 벽 추가
  ↓
Drag & Drop으로 배치
  ↓
크기 / 위치 / 회전 수정
  ↓
Undo / Redo
  ↓
저장
  ↓
사용자는 실제 레이아웃 기반으로 좌석 예약
```

### 1.3 주요 사용자

#### 일반 사용자

* 공유오피스
* 스터디룸
* 사무실 좌석
* 기타 예약형 공간

#### 관리자

* 공간 생성 및 관리
* 좌석 및 공간 오브젝트 배치
* 좌석 상태 관리
* 예약 현황 확인

---

# 2. 핵심 사용자 시나리오

## 2.1 관리자

```text
관리자 로그인
→ 공간 생성
→ 공간 에디터 진입
→ 좌석 추가
→ 테이블 / 벽 추가
→ Drag & Drop으로 배치
→ 회전 / 위치 수정
→ Undo / Redo
→ 레이아웃 저장
→ 예약 현황 확인
```

## 2.2 일반 사용자

```text
공간 목록
→ 공간 상세
→ 레이아웃 확인
→ 좌석 선택
→ 날짜 선택
→ 시간 선택
→ 예약
→ 내 예약 확인
→ 예약 취소
```

---

# 3. MVP 범위

## 3.1 일반 사용자

* 공간 목록 조회
* 공간 상세 조회
* 공간 레이아웃 조회
* 좌석 선택
* 날짜 선택
* 시간 선택
* 좌석 예약
* 예약 취소
* 내 예약 조회

## 3.2 관리자

* 공간 CRUD
* 좌석 추가
* 좌석 삭제
* 좌석 이동
* 좌석 회전
* 좌석 상태 변경
* 테이블 추가 / 삭제
* 벽 추가 / 삭제
* 레이아웃 저장
* 예약 현황 조회

---

# 4. Interactive Space Editor

## 4.1 Editor Route

```text
/admin/rooms/[roomId]/editor
```

## 4.2 기본 UI

```text
┌──────────────────────────────────────────────┐
│ Header                         저장   상태     │
├────────────┬───────────────────┬─────────────┤
│            │                   │              │
│ Object     │                   │ Properties   │
│ Toolbar    │     Canvas        │ Panel        │
│            │                   │              │
│ + Seat     │                   │ 이름         │
│ + Table    │                   │ 상태         │
│ + Wall     │                   │ 회전         │
│            │                   │ 삭제         │
│            │                   │              │
└────────────┴───────────────────┴─────────────┘
```

### Object Toolbar

* Seat
* Table
* Wall

### Properties Panel

선택된 오브젝트에 따라 표시한다.

#### Seat

* 이름
* 상태
* 위치
* 크기
* 회전
* 삭제

#### Table / Wall

* 위치
* 크기
* 회전
* 삭제

---

# 5. Space Object

## 5.1 MVP Object

```text
seat
table
wall
```

향후 확장 가능:

```text
plant
partition
door
etc.
```

## 5.2 기본 데이터 구조

```ts
type SpaceObject = {
  id: string;
  roomId: string;

  type: "seat" | "table" | "wall";

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: number;
};

type Seat = SpaceObject & {
  type: "seat";

  name: string;

  status: "available" | "disabled";
};
```

### 설계 원칙

Canvas에 표시되는 모든 요소는 `SpaceObject`를 기반으로 관리한다.

이를 통해 향후 새로운 Object Type을 추가하더라도 Editor의 기본 동작을 재사용할 수 있도록 설계한다.

---

# 6. Editor 기능

## 6.1 Object 추가

```text
+ Seat
+ Table
+ Wall
```

추가된 Object는 기본 좌표에 생성된다.

## 6.2 Drag & Drop

오브젝트를 마우스로 이동할 수 있다.

```text
mousedown
→ drag
→ canvas 좌표 계산
→ object position 변경
```

화면 좌표와 Canvas 좌표가 다르기 때문에 **Zoom / Pan을 고려한 좌표 변환**을 적용한다.

## 6.3 Object 선택

Object 클릭:

```text
selectedObjectId 변경
→ Properties Panel 업데이트
```

Canvas 외부 클릭:

```text
selectedObjectId = null
```

## 6.4 회전

Object 선택 후 회전 값을 변경할 수 있다.

```text
rotation: 0
rotation: 90
rotation: 180
rotation: 270
```

## 6.5 삭제

선택된 Object를 삭제한다.

```text
Delete
Backspace
```

키보드 삭제도 지원한다.

---

# 7. Undo / Redo

Editor의 주요 변경 사항을 History로 관리한다.

```text
objects
   ↓
History
   ↓
Past / Present / Future
```

지원 기능:

* Undo
* Redo
* Ctrl + Z
* Ctrl + Shift + Z

Undo 대상:

* Object 추가
* Object 삭제
* Object 이동
* Object 회전
* Object 수정

---

# 8. Zoom / Pan

## 8.1 Zoom

지원 배율:

```text
50%
75%
100%
125%
150%
```

마우스 휠을 사용해 Zoom한다.

## 8.2 Pan

Desktop:

```text
Space + Drag
```

또는 별도의 Pan 조작을 제공한다.

Mobile에서는 복잡한 제스처를 최소화하고 Zoom Control을 제공한다.

---

# 9. Dirty State

Editor에서 저장되지 않은 변경사항을 표시한다.

```text
Clean
↓
Object 이동
↓
Dirty
```

UI 예시:

```text
● 저장되지 않은 변경사항

[저장]
```

저장 완료:

```text
✓ 저장됨
```

페이지를 이탈할 때 저장되지 않은 변경사항이 있으면 확인 UI를 표시한다.

```text
저장하지 않은 변경사항이 있습니다.
페이지를 나가시겠습니까?
```

---

# 10. 저장 전략

MVP에서는 **Autosave를 사용하지 않는다.**

관리자가 명시적으로 저장 버튼을 눌렀을 때 서버에 저장한다.

```text
Editor State
     ↓
Save
     ↓
Validation
     ↓
Supabase
```

이를 통해 로컬 편집 상태와 서버의 저장 상태를 명확하게 분리한다.

---

# 11. State Management

## 11.1 Editor Client State

Zustand 사용.

관리 대상:

```ts
selectedObject
objects
zoom
pan
history
future
isDirty
```

## 11.2 Server State

TanStack Query 사용을 우선 검토한다.

관리 대상:

```text
rooms
spaceObjects
reservations
```

Supabase를 직접 호출하는 경우에도 Server State와 Editor State를 분리한다.

### 핵심 원칙

```text
Server State
→ 서버에 저장된 실제 데이터

Editor State
→ 현재 사용자가 편집 중인 임시 상태
```

예:

```text
DB
A1: x=100

        ↓ Load

Zustand
A1: x=100

        ↓ Drag

Zustand
A1: x=250

        ↓ Save

DB
A1: x=250
```

---

# 12. Reservation

## 12.1 예약 흐름

```text
공간 선택
→ 좌석 선택
→ 날짜 선택
→ 시작 시간
→ 종료 시간
→ 예약
```

## 12.2 예약 충돌

시간이 겹치는 경우 예약할 수 없다.

예:

```text
A3
10:00 ───── 12:00

11:00 ───── 13:00
        ❌ 충돌

12:00 ───── 14:00
        ✅ 가능
```

예약 가능 조건:

```text
newStart < existingEnd
AND
newEnd > existingStart
```

단, 최종 예약 무결성은 **프론트엔드가 아니라 서버/DB에서 보장한다.**

Frontend:

```text
예약 가능 여부 표시
```

Server / DB:

```text
실제 예약 가능 여부 검증
→ 충돌 시 예약 거부
```

---

# 13. Database

## 13.1 users

```text
id
email
name
role
created_at
```

`role`

```text
user
admin
```

## 13.2 rooms

```text
id
name
description
image_url
created_at
updated_at
```

## 13.3 space_objects

```text
id
room_id
type
x
y
width
height
rotation
created_at
updated_at
```

## 13.4 seats

```text
id
space_object_id
name
status
```

`status`

```text
available
disabled
```

## 13.5 reservations

```text
id
user_id
seat_id
start_at
end_at
status
created_at
```

`status`

```text
reserved
cancelled
```

> 실제 구현 전 `space_objects`와 `seats`의 관계는 최종 확정한다.
> MVP에서는 Seat을 SpaceObject의 확장 개념으로 유지하되, 테이블처럼 여러 좌석을 포함할 수 있는 구조가 필요한지 검토한다.

---

# 14. 페이지 구조

```text
/
├── /rooms
│
├── /rooms/[roomId]
│
├── /reservations
│
└── /admin
    ├── /rooms
    ├── /rooms/new
    ├── /rooms/[roomId]
    ├── /rooms/[roomId]/editor
    └── /reservations
```

---

# 15. 반응형 UX

## Desktop

```text
Toolbar
   +
Canvas
   +
Properties Panel
```

Editor는 넓은 화면을 기준으로 설계한다.

## Mobile

Editor:

```text
Canvas
↓
Control Bar
↓
Bottom Sheet
```

복잡한 데스크톱 Editor UI를 그대로 축소하지 않는다.

일반 사용자 예약 화면은 모바일 사용성을 우선한다.

---

# 16. 기술 스택

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui

Zustand
TanStack Query

React Hook Form
Zod

Supabase
PostgreSQL
Supabase Realtime

dnd-kit

Vitest
Playwright
```

### 원칙

필요하지 않은 라이브러리는 추가하지 않는다.

특히 MVP에서는 다음을 구현하지 않는다.

```text
실시간 공동 편집
AI 기능
결제
알림 시스템
복잡한 권한 시스템
고급 이미지 편집
과도한 애니메이션
불필요한 Design System 추상화
```

---

# 17. 테스트

## Unit Test

Editor 핵심 로직:

* 좌표 계산
* Zoom 좌표 변환
* Undo / Redo
* Object 추가 / 삭제
* Object 이동
* 예약 시간 충돌 검사

## E2E Test

### 관리자

```text
로그인
→ 공간 생성
→ Editor 진입
→ Seat 추가
→ Seat 이동
→ 저장
→ 페이지 새로고침
→ 레이아웃 유지 확인
```

### 사용자

```text
공간 조회
→ 좌석 선택
→ 시간 선택
→ 예약
→ 내 예약 확인
→ 예약 취소
```

### 예약 충돌

```text
User A
10:00 ~ 12:00 예약

User B
11:00 ~ 13:00 예약 시도

→ 예약 실패
```

---

# 18. 구현 우선순위

## Phase 1 — 기본 서비스

```text
Auth
↓
Room CRUD
↓
Room Detail
```

## Phase 2 — 핵심 Editor

```text
Object 추가
↓
Object 선택
↓
Drag & Drop
↓
회전
↓
삭제
↓
저장
```

## Phase 3 — Editor 완성

```text
Undo / Redo
↓
Zoom
↓
Pan
↓
Dirty State
↓
Keyboard Control
↓
Responsive
```

## Phase 4 — 예약

```text
Seat 선택
↓
Date 선택
↓
Time 선택
↓
예약
↓
충돌 검증
↓
예약 취소
↓
내 예약
```

## Phase 5 — 품질

```text
Loading
Empty
Error
Responsive
Unit Test
E2E Test
Performance
Accessibility
```

## Phase 6 — 배포 / 포트폴리오

```text
Deploy
↓
README
↓
Architecture
↓
Technical Decisions
↓
Troubleshooting
↓
Interview Questions
```

---

# 19. 포트폴리오 핵심 포인트

DeskFlow에서는 기능 개수보다 다음 문제를 중심으로 설명한다.

### 1. Canvas 좌표 관리

```text
Screen Coordinate
        ↓
Zoom / Pan Transform
        ↓
Canvas Coordinate
```

Drag & Drop 과정에서 좌표를 어떻게 계산했는지 설명한다.

### 2. Zoom / Pan

Zoom 상태에서 오브젝트를 정확한 위치로 이동시키기 위해 어떤 좌표 변환을 사용했는지 설명한다.

### 3. Undo / Redo

Editor 변경사항을 어떤 History 구조로 관리했는지 설명한다.

### 4. Editor State와 Server State 분리

```text
Zustand
→ 현재 편집 상태

TanStack Query / Supabase
→ 서버 데이터
```

왜 분리했는지 설명한다.

### 5. 예약 충돌 방지

Frontend에서 단순히 예약 가능 여부를 보여주는 것과 실제 데이터 무결성을 보장하는 것은 다르다.

따라서 최종 검증은 Server / DB에서 수행한다.

### 6. Mobile Editor

Desktop 중심의 Editor를 모바일에서 어떻게 단순화했는지 설명한다.

---

# 20. MVP 완료 기준

다음 흐름이 정상적으로 동작하면 DeskFlow MVP 완료로 정의한다.

### 관리자

```text
로그인
→ 공간 생성
→ Editor 진입
→ Seat / Table / Wall 추가
→ Drag & Drop
→ 회전
→ 삭제
→ Undo / Redo
→ Zoom / Pan
→ 저장
```

### 사용자

```text
공간 목록
→ 공간 상세
→ 실제 레이아웃 확인
→ 좌석 선택
→ 날짜 / 시간 선택
→ 예약
→ 내 예약 확인
→ 예약 취소
```

### 시스템

```text
예약 충돌 방지
+
저장되지 않은 Editor 변경사항 표시
+
새로고침 후 저장된 Layout 유지
+
Desktop / Mobile 대응
```

---

# 21. 프로젝트의 핵심 기술 질문

DeskFlow 개발 과정에서 다음 질문에 답할 수 있어야 한다.

```text
1. Canvas 좌표와 화면 좌표는 어떻게 변환하는가?

2. Zoom 상태에서 Drag 좌표는 어떻게 계산하는가?

3. Undo / Redo는 어떤 데이터 구조로 구현했는가?

4. Editor State와 Server State를 왜 분리했는가?

5. 왜 Autosave 대신 명시적 Save를 선택했는가?

6. 여러 사용자가 동시에 같은 좌석을 예약하면 어떻게 막는가?

7. 예약 충돌 검증을 Frontend에서만 하면 왜 안 되는가?

8. SpaceObject와 Seat을 왜 분리했는가?

9. 새로운 Object Type을 추가할 때 기존 Editor 코드를 어떻게 재사용하는가?

10. 모바일에서 Desktop Editor와 다른 UX를 사용하는 이유는 무엇인가?

11. 대규모 Object가 존재할 때 Canvas 성능 문제를 어떻게 해결할 것인가?

12. 저장 실패 / 네트워크 오류가 발생했을 때 Editor 상태를 어떻게 처리할 것인가?
```

---

# 22. 프로젝트 목표

DeskFlow는 단순 CRUD 프로젝트가 아니라 다음 역량을 보여주는 것을 목표로 한다.

```text
Interactive UI
+
Complex State Management
+
Coordinate System
+
Server State
+
Database Integrity
+
Responsive UX
+
Testing
```

최종적으로 **"기능을 구현할 수 있는 신입"이 아니라 "복잡한 프론트엔드 문제를 구조적으로 해결할 수 있는 신입"**을 보여주는 프로젝트로 완성한다.

---

# 부록. 확정 사항 (2026-09-14 검토 반영)

원문은 위와 같이 유지한다. 아래는 구현 전 검토에서 확정한 변경/보강이며, 원문과 충돌하면 부록이 우선한다. 상세 설계는 `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md`.

## 범위 (2일 MVP)
- 포함: Auth, Room CRUD, Editor 전체(6~10절), 예약 전체(12절), 배포, README, Vitest.
- 제외(이후 Phase): 모바일 Editor(15절 Bottom Sheet), Playwright E2E, 리사이즈 핸들, 다중 선택, 자유 회전. 예약 화면은 모바일 대응.

## 기술 스택 변경
- 제거: dnd-kit(Pointer Events 직접 구현), Supabase Realtime, shadcn/ui, React Hook Form, Playwright(Phase 5 이후).
- 서버 통신: **Server Action 사용 안 함.** 모든 쓰기와 클라이언트 읽기는 Route Handler(`/api/*`).
- 서버 상태: TanStack Query. 초기 데이터는 서버 prefetch + `HydrationBoundary`. 서버 prefetch 도 `/api` 를 호출한다(단일 queryFn).
- 인증 호출도 `/api/auth/*` 경유. 프론트 코드는 Supabase 를 직접 알지 않는다.
- Canvas 렌더링: SVG.

## Editor 세부 확정
- 히스토리 단위: 드래그 1회 = 1단계. 스냅샷 방식, 상한 100.
- Dirty: `document !== lastSavedDocument` 참조 비교. 별도 플래그 없음.
- 새 오브젝트 기본 좌표: 현재 뷰포트 중심. 그리드 스냅 10px.
- 선택: 단일. 회전: 90° 단위, 오브젝트 중심 기준, width/height 스왑 없음.
- 크기 수정: Properties Panel 숫자 입력.
- Zoom: 휠 1틱 = 1단계(50/75/100/125/150), 커서 위치 고정. Pan: Space+드래그.
- 입력창 포커스 중 Delete/Backspace 는 오브젝트 삭제 안 함.
- 저장 실패: 편집 상태 유지 + 에러 표시 + 재시도. 버전 충돌(409) 시 "서버 버전 불러오기" 제공.

## DB 보강
- `users` → `profiles`(auth.users 1:1, name, role). email 은 auth.users 에만.
- `rooms`: `image_url` 제거, `width`, `height`, `layout_version` 추가.
- `space_objects`: `z_index` 추가. `seats` 는 별도 테이블, `space_object_id` unique.
- `reservations`: `cancelled_at` 추가, `start_at < end_at` check, **exclusion constraint** 로 좌석·시간 겹침 차단.
- 저장은 RPC `save_room_layout(room_id, expected_version, objects)` 한 트랜잭션.

## 예약 세부 확정
- 시간 단위 30분. 운영 시간 09:00~22:00 상수. 과거 시각 불가.
- 흐름: 날짜/시간 먼저 선택 → 배치도에 좌석 상태(가능/예약됨/내 예약/비활성) 표시 → 좌석 클릭 → 예약.
- 일반 사용자는 남의 예약 행을 읽지 못한다. 가용성은 점유 seat_id 목록만 반환.
