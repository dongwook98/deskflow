-- DeskFlow 초기 스키마. 스펙: docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md 5절
-- 적용: supabase link --project-ref <ref> && supabase db push

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'admin');
create type public.object_type as enum ('seat', 'table', 'wall');
create type public.seat_status as enum ('available', 'disabled');
create type public.reservation_status as enum ('reserved', 'cancelled');

-- ---------------------------------------------------------------------------
-- profiles : auth.users 1:1
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  role       public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 현재 사용자가 admin 인지. security definer 라 RLS 재귀 없음.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 일반 사용자가 자기 role 을 바꾸지 못하게
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'role change not allowed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 100),
  description    text not null default '',
  width          integer not null check (width between 200 and 10000),
  height         integer not null check (height between 200 and 10000),
  layout_version integer not null default 0,
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- space_objects : 캔버스 위 모든 오브젝트
-- ---------------------------------------------------------------------------
create table public.space_objects (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  type       public.object_type not null,
  x          double precision not null,
  y          double precision not null,
  width      double precision not null check (width > 0),
  height     double precision not null check (height > 0),
  rotation   double precision not null default 0,
  z_index    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index space_objects_room_id_idx on public.space_objects (room_id);

-- ---------------------------------------------------------------------------
-- seats : type = 'seat' 인 space_object 의 확장 (1:1)
-- ---------------------------------------------------------------------------
create table public.seats (
  id              uuid primary key default gen_random_uuid(),
  space_object_id uuid not null unique references public.space_objects (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 50),
  status          public.seat_status not null default 'available'
);

-- ---------------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------------
create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- 예약이 있는 좌석은 삭제 불가 (레이아웃 저장 시 23503 → 409 seat_has_reservations)
  seat_id      uuid not null references public.seats (id) on delete restrict,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  status       public.reservation_status not null default 'reserved',
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,

  constraint reservations_time_order check (start_at < end_at),

  -- 핵심: 같은 좌석 + 겹치는 시간 + 둘 다 reserved 이면 거부 (SQLSTATE 23P01)
  constraint reservations_no_overlap
    exclude using gist (seat_id with =, tstzrange(start_at, end_at, '[)') with &&)
    where (status = 'reserved')
);

create index reservations_user_id_idx on public.reservations (user_id);
create index reservations_seat_id_start_at_idx on public.reservations (seat_id, start_at);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create trigger space_objects_set_updated_at
  before update on public.space_objects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: save_room_layout
-- 에디터 문서 전체를 한 트랜잭션으로 저장. 버전 불일치 시 실패.
-- p_objects: SpaceObjectDto[] (camelCase)
--   [{ id, type, x, y, width, height, rotation, zIndex, seat?: { id, name, status } }]
-- 반환: 새 layout_version
-- security invoker: RLS 가 그대로 적용된다 (admin 만 쓰기 가능)
-- ---------------------------------------------------------------------------
create or replace function public.save_room_layout(
  p_room_id uuid,
  p_expected_version integer,
  p_objects jsonb
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_current integer;
  v_next integer;
begin
  select layout_version into v_current
  from public.rooms
  where id = p_room_id
  for update;

  if v_current is null then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001',
      detail = format('expected %s, current %s', p_expected_version, v_current);
  end if;

  -- 1. 문서에서 사라진 오브젝트 삭제 (seats 는 cascade, 예약 있는 좌석은 restrict 로 실패)
  delete from public.space_objects so
  where so.room_id = p_room_id
    and not exists (
      select 1 from jsonb_array_elements(p_objects) o
      where (o ->> 'id')::uuid = so.id
    );

  -- 2. space_objects upsert
  insert into public.space_objects (id, room_id, type, x, y, width, height, rotation, z_index)
  select
    (o ->> 'id')::uuid,
    p_room_id,
    (o ->> 'type')::public.object_type,
    (o ->> 'x')::double precision,
    (o ->> 'y')::double precision,
    (o ->> 'width')::double precision,
    (o ->> 'height')::double precision,
    coalesce((o ->> 'rotation')::double precision, 0),
    coalesce((o ->> 'zIndex')::integer, 0)
  from jsonb_array_elements(p_objects) o
  on conflict (id) do update set
    type     = excluded.type,
    x        = excluded.x,
    y        = excluded.y,
    width    = excluded.width,
    height   = excluded.height,
    rotation = excluded.rotation,
    z_index  = excluded.z_index
  where public.space_objects.room_id = p_room_id;

  -- 3. seats upsert. 충돌 기준은 space_object_id 라 기존 seat.id 가 유지된다 (예약 FK 안전)
  insert into public.seats (id, space_object_id, name, status)
  select
    coalesce((o -> 'seat' ->> 'id')::uuid, gen_random_uuid()),
    (o ->> 'id')::uuid,
    o -> 'seat' ->> 'name',
    coalesce((o -> 'seat' ->> 'status')::public.seat_status, 'available')
  from jsonb_array_elements(p_objects) o
  where o ->> 'type' = 'seat'
  on conflict (space_object_id) do update set
    name   = excluded.name,
    status = excluded.status;

  v_next := v_current + 1;
  update public.rooms set layout_version = v_next where id = p_room_id;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_seat_availability
-- 시간 범위와 겹치는 reserved 예약의 seat_id 만 노출. 남의 예약 행은 보이지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.get_seat_availability(
  p_room_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (seat_id uuid, mine boolean)
language sql
stable
security definer set search_path = public
as $$
  select r.seat_id, bool_or(r.user_id = auth.uid()) as mine
  from public.reservations r
  join public.seats s on s.id = r.seat_id
  join public.space_objects so on so.id = s.space_object_id
  where so.room_id = p_room_id
    and r.status = 'reserved'
    and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    and auth.uid() is not null
  group by r.seat_id;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.rooms         enable row level security;
alter table public.space_objects enable row level security;
alter table public.seats         enable row level security;
alter table public.reservations  enable row level security;

-- profiles
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- rooms
create policy "rooms_select_authenticated"
  on public.rooms for select
  to authenticated
  using (true);

create policy "rooms_write_admin"
  on public.rooms for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- space_objects
create policy "space_objects_select_authenticated"
  on public.space_objects for select
  to authenticated
  using (true);

create policy "space_objects_write_admin"
  on public.space_objects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- seats
create policy "seats_select_authenticated"
  on public.seats for select
  to authenticated
  using (true);

create policy "seats_write_admin"
  on public.seats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- reservations
create policy "reservations_select_own_or_admin"
  on public.reservations for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "reservations_insert_own_future"
  on public.reservations for insert
  to authenticated
  with check (user_id = auth.uid() and start_at > now());

create policy "reservations_update_own_or_admin"
  on public.reservations for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
