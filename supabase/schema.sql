-- 급똥지하철 답사 데이터 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.

-- ───────── 테이블 ─────────

-- 역 정보 (팀이 관리. 일반 사용자는 읽기만)
create table public.stations (
  id            bigint generated always as identity primary key,
  line          text not null check (char_length(line) between 1 and 10),
  name          text not null check (char_length(name) between 1 and 30),
  toilets       smallint check (toilets between 0 and 20),       -- 화장실 개수
  stalls        smallint check (stalls between 0 and 100),       -- 대변기 칸 수
  gate          text check (gate in ('개찰구 내부', '개찰구 외부')),
  prev_station  text check (char_length(prev_station) <= 30),    -- 방향 1의 출발 쪽 역
  next_station  text check (char_length(next_station) <= 30),
  updated_at    timestamptz not null default now(),
  unique (line, name)
);

-- 하차 경로 (팀 답사 + 사용자 제보)
create table public.routes (
  id            bigint generated always as identity primary key,
  line          text not null check (char_length(line) between 1 and 10),
  station       text not null check (char_length(station) between 1 and 30),
  dir           smallint not null check (dir in (0, 1)),
  from_station  text check (char_length(from_station) <= 30),    -- 직전 역
  to_station    text check (char_length(to_station) <= 30),      -- 다음 역
  car           smallint check (car between 1 and 10),           -- 하차 칸
  door          smallint check (door between 1 and 4),           -- 하차 문
  opp_door      text check (char_length(opp_door) <= 10),        -- 반대 방향 맞은편 문
  steps         jsonb not null check (
                  jsonb_typeof(steps) = 'array'
                  and jsonb_array_length(steps) between 1 and 40
                  and octet_length(steps::text) <= 8000),        -- [{a, pre, mods[]}]
  seconds       integer check (seconds between 0 and 3600),      -- 소요 시간(초)
  note          text check (char_length(note) <= 500),
  toilets       smallint check (toilets between 0 and 20),       -- 제보자가 적은 역 정보
  stalls        smallint check (stalls between 0 and 100),
  gate          text check (gate in ('개찰구 내부', '개찰구 외부')),
  nickname      text check (char_length(nickname) <= 20),
  source        text not null default 'user' check (source in ('team', 'user')),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index routes_status_station on public.routes (status, line, station);

-- 검수 권한이 있는 팀원
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ───────── 테이블 접근 권한 ─────────
-- 프로젝트 생성 때 "Automatically expose new tables"를 껐기 때문에 필요한 권한만 직접 줌.
-- 실제로 어떤 줄을 보고 쓸 수 있는지는 아래 RLS 규칙이 한 번 더 걸러요.
grant usage on schema public to anon, authenticated;
grant select on public.stations to anon, authenticated;
grant insert, update, delete on public.stations to authenticated;
grant select, insert on public.routes to anon, authenticated;
grant update, delete on public.routes to authenticated;
grant select on public.admins to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────── 접근 규칙 (RLS) ─────────
alter table public.stations enable row level security;
alter table public.routes   enable row level security;
alter table public.admins   enable row level security;

-- 역: 누구나 읽기, 팀만 쓰기
create policy "stations read"        on public.stations for select using (true);
create policy "stations admin write" on public.stations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 경로: 승인된 것만 공개. 팀은 전부 봄
create policy "routes read" on public.routes for select
  using (status = 'approved' or public.is_admin());
-- 누구나 제보 가능하지만 반드시 '검수 대기'로만 들어감. 팀은 바로 승인 상태로 넣을 수 있음
create policy "routes submit" on public.routes for insert to anon, authenticated
  with check ((status = 'pending' and source = 'user' and reviewed_at is null) or public.is_admin());
create policy "routes admin update" on public.routes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "routes admin delete" on public.routes for delete to authenticated
  using (public.is_admin());

-- 팀원 목록: 본인 줄만 보임 (내가 팀원인지 확인용)
create policy "admins read self" on public.admins for select to authenticated
  using (user_id = auth.uid());

-- ───────── 이미 답사한 데이터 (3호선 충무로·종로3가) ─────────
insert into public.stations (line, name, toilets, stalls, gate, prev_station, next_station) values
  ('3', '충무로', 1, 7, '개찰구 내부', '을지로3가', '동대입구'),
  ('3', '종로3가', 1, 4, '개찰구 내부', '을지로3가', '안국');

insert into public.routes (line, station, dir, from_station, to_station, car, door, opp_door, seconds, steps, source, status, reviewed_at) values
  ('3','충무로',0,'을지로3가','동대입구',5,2,null,100,
   '[{"a":"하차","pre":"","mods":["위 표지판"]},{"a":"에스컬레이터","pre":"","mods":["위 표지판"]},{"a":"좌회전","pre":"","mods":[]},{"a":"직진","pre":"","mods":["위 표지판"]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','충무로',0,'을지로3가','동대입구',8,4,null,140,
   '[{"a":"하차","pre":"","mods":[]},{"a":"계단","pre":"전방","mods":[]},{"a":"에스컬레이터","pre":"","mods":[]},{"a":"유턴","pre":"","mods":[]},{"a":"직진","pre":"","mods":[]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','충무로',1,'동대입구','을지로3가',6,3,null,100,
   '[{"a":"하차","pre":"","mods":["표지판"]},{"a":"에스컬레이터","pre":"","mods":["표지판"]},{"a":"좌회전","pre":"","mods":[]},{"a":"직진","pre":"","mods":["표지판"]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','충무로',1,'동대입구','을지로3가',4,4,null,87,
   '[{"a":"하차","pre":"","mods":["왼쪽 벽 표지판"]},{"a":"계단","pre":"전방","mods":["4호선 방향"]},{"a":"직진","pre":"","mods":[]},{"a":"에스컬 중간에 내림","pre":"","mods":["한 칸만"]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','종로3가',0,'을지로3가','안국',7,1,'4-4',100,
   '[{"a":"하차","pre":"","mods":[]},{"a":"계단","pre":"전방","mods":[]},{"a":"유턴","pre":"","mods":[]},{"a":"직진","pre":"","mods":["무빙워크에 표지판"]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','종로3가',0,'을지로3가','안국',4,3,'7-2',35,
   '[{"a":"하차","pre":"","mods":[]},{"a":"계단","pre":"전방","mods":["올라가면 표지판"]},{"a":"직진","pre":"","mods":[]},{"a":"도착","pre":"","mods":[]}]','team','approved',now()),
  ('3','종로3가',0,'을지로3가','안국',2,2,'9-3',25,
   '[{"a":"하차","pre":"","mods":[]},{"a":"계단","pre":"전방","mods":[]},{"a":"유턴","pre":"","mods":[]},{"a":"도착","pre":"","mods":[]}]','team','approved',now());
