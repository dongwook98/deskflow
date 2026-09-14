#!/usr/bin/env bash
# 마이그레이션 로컬 검증. 임시 Postgres(포트 5433, trust) 를 띄워 Supabase 환경(auth 스키마, roles, 권한)을 흉내 낸 뒤
# supabase/migrations/*.sql 을 순서대로 적용하고 핵심 제약을 확인한다. 끝나면 인스턴스 삭제.
# 요구: Homebrew postgresql (initdb, pg_ctl, psql)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D="$(mktemp -d /tmp/deskflow-pg.XXXXXX)"
PORT="${PORT:-5433}"
cleanup() { pg_ctl -D "$D" stop >/dev/null 2>&1 || true; rm -rf "$D"; }
trap cleanup EXIT

initdb -D "$D" -A trust -U postgres >/dev/null
pg_ctl -D "$D" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$D/pg.log" start >/dev/null
sleep 2
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres
psql -d postgres -Atc "create database deskflow_test" >/dev/null

psql -d deskflow_test -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  psql -d deskflow_test -v ON_ERROR_STOP=1 -q -f "$f"
done

psql -d deskflow_test -v ON_ERROR_STOP=1 -q <<'SQL'
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
SQL

psql -d deskflow_test -v ON_ERROR_STOP=1 -q -At <<'SQL' 2>&1 | sed 's/^NOTICE:  //; s/^알림:  //' | grep -v '^[0-9a-f-]\{36\}$'
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x.com','{"name":"Admin"}'),
                              ('22222222-2222-2222-2222-222222222222','user@x.com','{}');
update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  update public.profiles set role='admin' where id='22222222-2222-2222-2222-222222222222';
  raise exception 'expected role change block';
exception when insufficient_privilege then raise notice 'self role escalation blocked OK';
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into public.rooms (id, name, width, height, created_by) values ('aaaaaaaa-0000-0000-0000-000000000001','Room A',1000,800,'11111111-1111-1111-1111-111111111111');
select 'save v=' || public.save_room_layout('aaaaaaaa-0000-0000-0000-000000000001', 0, '[
  {"id":"bbbbbbbb-0000-0000-0000-000000000001","type":"seat","x":10,"y":10,"width":40,"height":40,"rotation":0,"zIndex":0,"seat":{"id":"cccccccc-0000-0000-0000-000000000001","name":"A1","status":"available"}},
  {"id":"bbbbbbbb-0000-0000-0000-000000000002","type":"table","x":100,"y":10,"width":120,"height":60,"rotation":90,"zIndex":1}
]'::jsonb);
do $$ begin
  perform public.save_room_layout('aaaaaaaa-0000-0000-0000-000000000001', 0, '[]'::jsonb);
  raise exception 'expected version_conflict';
exception when others then
  if sqlerrm <> 'version_conflict' then raise; end if;
  raise notice 'version_conflict OK';
end $$;
select 'save v=' || public.save_room_layout('aaaaaaaa-0000-0000-0000-000000000001', 1, '[
  {"id":"bbbbbbbb-0000-0000-0000-000000000001","type":"seat","x":20,"y":20,"width":40,"height":40,"rotation":0,"zIndex":0,"seat":{"id":"dddddddd-0000-0000-0000-000000000009","name":"A1-renamed","status":"disabled"}}
]'::jsonb);
select 'seat id kept: ' || (id = 'cccccccc-0000-0000-0000-000000000001')::text from public.seats;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  insert into public.rooms (name,width,height,created_by) values ('hack',500,500,'22222222-2222-2222-2222-222222222222');
  raise exception 'expected RLS denial';
exception when insufficient_privilege then raise notice 'RLS room insert denied OK';
end $$;
reset role; update public.seats set status='available'; set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
insert into public.reservations (user_id, seat_id, start_at, end_at)
  values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 2 hours');
do $$ begin
  insert into public.reservations (user_id, seat_id, start_at, end_at)
    values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001', now() + interval '1 day 1 hour', now() + interval '1 day 3 hours');
  raise exception 'expected overlap';
exception when exclusion_violation then raise notice 'overlap 23P01 OK';
end $$;
insert into public.reservations (user_id, seat_id, start_at, end_at)
  values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001', now() + interval '1 day 2 hours', now() + interval '1 day 3 hours');
select 'adjacent reservation OK';
do $$ begin
  insert into public.reservations (user_id, seat_id, start_at, end_at)
    values ('22222222-2222-2222-2222-222222222222','cccccccc-0000-0000-0000-000000000001', now() - interval '1 hour', now());
  raise exception 'expected past denial';
exception when insufficient_privilege then raise notice 'past reservation denied OK';
end $$;
select 'availability: ' || count(*) || ' seat(s), mine=' || bool_and(mine) from public.get_seat_availability('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 30 minutes');
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  perform public.save_room_layout('aaaaaaaa-0000-0000-0000-000000000001', 2, '[]'::jsonb);
  raise exception 'expected restrict';
exception when foreign_key_violation then raise notice 'seat with reservations delete blocked 23503 OK';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
select 'view rows for user: ' || count(*) || ' (expect 2)' from public.reservation_details;
select 'view has names: ' || bool_and(seat_name = 'A1-renamed' and room_name = 'Room A' and user_name = 'user') from public.reservation_details;
select 'ALL SMOKE PASSED';
SQL
