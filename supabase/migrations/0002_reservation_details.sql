-- 예약 조회용 뷰. 좌석명·룸명·사용자명을 한 번에 조인한다.
-- security_invoker: 호출자의 RLS 가 적용된다 → 일반 사용자는 본인 예약만, admin 은 전체.
create view public.reservation_details
with (security_invoker = true) as
select
  r.id,
  r.user_id,
  p.name        as user_name,
  r.seat_id,
  s.name        as seat_name,
  so.room_id,
  rm.name       as room_name,
  r.start_at,
  r.end_at,
  r.status,
  r.created_at,
  r.cancelled_at
from public.reservations r
join public.seats s          on s.id = r.seat_id
join public.space_objects so on so.id = s.space_object_id
join public.rooms rm         on rm.id = so.room_id
join public.profiles p       on p.id = r.user_id;

grant select on public.reservation_details to authenticated;
