/**
 * 두 구간 [aStart, aEnd) 와 [bStart, bEnd) 가 겹치는가. PRD 12.2 의 조건과 동일.
 * UI 표시 보조용. 실제 무결성은 DB exclusion constraint(reservations_no_overlap) 가 보장한다 (D-29).
 */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return bs < ae && be > as;
}
