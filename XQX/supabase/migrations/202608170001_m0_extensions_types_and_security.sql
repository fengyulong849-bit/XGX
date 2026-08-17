-- 小确闲 M0：数据库扩展、公共枚举、配置表与安全基础。
-- 该迁移必须在全新 Supabase/Postgres 数据库中可重复执行。

begin;

create extension if not exists pgcrypto;

-- v1 受控业务枚举。使用 DO 块以便本地重建和远端迁移保持幂等。
do $$
begin
  create type public.pet_action as enum ('poke', 'slap', 'feed', 'throw');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.point_event_type as enum (
    'welcome',
    'pet_action',
    'rant_publish',
    'resonance_give',
    'resonance_claim',
    'release_complete',
    'checkin',
    'care_water',
    'care_sit',
    'pet_revive'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.rant_status as enum ('pending', 'published', 'destroyed', 'expired', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_status as enum ('pending', 'approved', 'rejected', 'hidden');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.care_type as enum ('water', 'sit');
exception when duplicate_object then null;
end $$;

-- 所有业务规则的默认值只由服务端读取和修改；前端不能直接读取或写入此表。
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint app_config_key_format check (key ~ '^[a-z][a-z0-9_.-]{1,99}$')
);

alter table public.app_config enable row level security;

-- 统一更新时间触发器，后续 M1–M7 表可复用。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 服务端业务日：当前 v1 以 Asia/Shanghai 为产品自然日；客户端日期仅作显示参考。
create or replace function public.business_date(now_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select (now_at at time zone 'Asia/Shanghai')::date;
$$;

-- 统一 API 安全错误体的生成函数。函数/RPC 应附带请求 ID，便于追踪且不得带敏感字段。
create or replace function public.api_error(reason_code text, request_id uuid default gen_random_uuid())
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'ok', false,
    'reason', reason_code,
    'request_id', request_id
  );
$$;

-- 首发可配置积分/上限。后续所有结算函数必须读取这些值，而不是写死在函数或前端中。
insert into public.app_config (key, value)
values
  ('points.welcome', '{"value":300}'::jsonb),
  ('points.pet_action', '{"value":10}'::jsonb),
  ('points.rant_publish', '{"value":50}'::jsonb),
  ('points.resonance_give', '{"value":10,"daily_cap":10}'::jsonb),
  ('points.resonance_claim', '{"value":10}'::jsonb),
  ('points.release_complete', '{"value":100,"minimum_age_hours":24}'::jsonb),
  ('points.checkin', '{"value":100,"surprises":{"normal":0,"small":10,"medium":20,"large":50}}'::jsonb),
  ('points.care_water', '{"value":20,"daily_cap":6}'::jsonb),
  ('points.care_sit', '{"value":30,"daily_cap":4}'::jsonb),
  ('points.pet_revive', '{"value":-500}'::jsonb),
  ('limits.rants_per_day', '{"value":3}'::jsonb),
  ('pet.endure_max', '{"value":100}'::jsonb),
  ('rant.retention_days', '{"value":15}'::jsonb)
on conflict (key) do nothing;

revoke all on table public.app_config from anon, authenticated;
grant usage on schema public to anon, authenticated;

commit;
