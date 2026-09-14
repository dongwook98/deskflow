/**
 * 예약 시간 슬롯 규칙 (PRD 부록): 30분 단위, 09:00~22:00, 타임존 Asia/Seoul 고정.
 * 서버(Vercel)는 UTC 라 "오늘"·"다음 슬롯" 계산은 클라이언트에서 이 모듈로만 한다 (D-33).
 * 한국은 DST 가 없어 고정 오프셋 +09:00 으로 계산해도 안전하다.
 */
export const KST_OFFSET = "+09:00";
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 22;
export const SLOT_MINUTES = 30;

const KST_MS = 9 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "09:00" … "22:00". 22:00 은 종료 시각으로만 쓰인다 */
export function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += SLOT_MINUTES) {
    slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return slots;
}

/** 날짜 + 시각 → 오프셋이 명시된 ISO. 서버는 이 문자열을 그대로 timestamptz 로 저장 */
export function toKstIso(date: string, time: string): string {
  return `${date}T${time}:00${KST_OFFSET}`;
}

/** now 를 KST 로 옮긴 Date (getUTC* 로 읽으면 KST 값이 나온다) */
function toKst(now: Date): Date {
  return new Date(now.getTime() + KST_MS);
}

export function todayKst(now = new Date()): string {
  const k = toKst(now);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

/**
 * 지금 이후 예약 가능한 첫 슬롯. 영업 전이면 당일 09:00, 영업 종료 후면 다음날 09:00.
 * 정각/30분 정각은 "이미 시작한 슬롯" 이므로 다음 슬롯으로 넘긴다.
 */
export function nextSlotAfter(now = new Date()): { date: string; time: string } {
  const k = toKst(now);
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  let next = (Math.floor(minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES;
  let day = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));

  if (next < OPEN_HOUR * 60) next = OPEN_HOUR * 60;
  // 마지막 시작 가능 슬롯은 21:30 (22:00 은 종료 전용)
  if (next > CLOSE_HOUR * 60 - SLOT_MINUTES) {
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    next = OPEN_HOUR * 60;
  }
  return {
    date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
    time: `${pad(Math.floor(next / 60))}:${pad(next % 60)}`,
  };
}

/** "HH:mm" 에 슬롯 count 개를 더한다. 22:00 을 넘으면 null */
export function addSlots(time: string, count: number): string | null {
  const [h, m] = time.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + count * SLOT_MINUTES;
  if (total > CLOSE_HOUR * 60) return null;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 목록·카드 표시용. 항상 KST 로 렌더 (서버·브라우저 어디서 실행돼도 같은 문자열) */
export function formatKst(iso: string): string {
  const k = toKst(new Date(iso));
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${WEEKDAYS[k.getUTCDay()]}) ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
