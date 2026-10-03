-- 화장실 단위로 경로를 연결하기 위한 변경
-- SQL Editor 에서 이 파일 → 003_toilets_seed.sql 순서로 한 번씩 실행.

-- 역 안의 화장실 하나하나 (공공데이터로 채우고, 답사하면서 팀이 고침)
create table public.toilets (
  id            bigint generated always as identity primary key,
  line          text not null check (char_length(line) between 1 and 10),     -- 공공데이터에 등록된 호선
  station       text not null check (char_length(station) between 1 and 30),  -- 역 이름 (끝의 '역' 없이)
  floor         text check (char_length(floor) <= 20),                         -- 지하1층
  gate          text check (gate in ('개찰구 내부', '개찰구 외부')),
  exit_no       text check (char_length(exit_no) <= 20),                       -- 근처 출구
  detail        text check (char_length(detail) <= 200),                       -- 상세 위치
  male_stalls   smallint check (male_stalls between 0 and 100),
  female_stalls smallint check (female_stalls between 0 and 100),
  source        text not null default 'public' check (source in ('public', 'team')),
  updated_at    timestamptz not null default now()
);
create index toilets_station on public.toilets (station);

-- 경로가 어느 화장실로 가는지. 목록에 없는 화장실이면 toilet_id 없이 toilet_detail(+ gate, stalls)에 적음
alter table public.routes
  add column toilet_id bigint references public.toilets (id) on delete set null,
  add column toilet_detail text check (char_length(toilet_detail) <= 200);

grant select on public.toilets to anon, authenticated;
grant insert, update, delete on public.toilets to authenticated;
grant usage on all sequences in schema public to anon, authenticated;

alter table public.toilets enable row level security;
create policy "toilets read"        on public.toilets for select using (true);
create policy "toilets admin write" on public.toilets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
