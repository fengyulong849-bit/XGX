-- M2：签到服务端结算，以及首次保存 DIY 后消耗免费权益。
begin;

create table if not exists public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_date date not null,
  streak integer not null check (streak > 0),
  points_delta integer not null check (points_delta > 0),
  surprise_delta integer not null default 0 check (surprise_delta >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, business_date)
);

alter table public.checkins enable row level security;
drop policy if exists checkins_select_own on public.checkins;
create policy checkins_select_own on public.checkins
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on table public.checkins from anon, authenticated;
grant select on table public.checkins to authenticated;

create or replace function public.m1_save_appearance(p_user_id uuid, p_appearance jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_max integer;
begin
  if p_user_id is null or jsonb_typeof(p_appearance) <> 'object' then return false; end if;
  for v_key, v_max in select * from (values
    ('face', 2), ('hair', 3), ('glasses', 2), ('beard', 2),
    ('expr', 3), ('suit', 3), ('belly', 2), ('skin', 3)
  ) as allowed(key, max_value)
  loop
    if not (p_appearance ? v_key)
      or jsonb_typeof(p_appearance -> v_key) <> 'number'
      or (p_appearance ->> v_key)::integer < 0
      or (p_appearance ->> v_key)::integer > v_max then return false; end if;
  end loop;
  update public.profiles
  set appearance = jsonb_build_object(
    'face', (p_appearance ->> 'face')::integer, 'hair', (p_appearance ->> 'hair')::integer,
    'glasses', (p_appearance ->> 'glasses')::integer, 'beard', (p_appearance ->> 'beard')::integer,
    'expr', (p_appearance ->> 'expr')::integer, 'suit', (p_appearance ->> 'suit')::integer,
    'belly', (p_appearance ->> 'belly')::integer, 'skin', (p_appearance ->> 'skin')::integer
  ),
  free_diy_available = false
  where user_id = p_user_id;
  return found;
end;
$$;

create or replace function public.m2_sign_checkin(p_user_id uuid, p_business_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.checkins%rowtype;
  v_streak integer := 1;
  v_surprise integer := 0;
  v_milestone integer := 0;
  v_delta integer;
  v_balance integer;
begin
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'profile_not_found'); end if;

  select * into v_existing from public.checkins
  where user_id = p_user_id and business_date = p_business_date;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_signed', true, 'streak', v_existing.streak,
      'points_delta', 0, 'points_balance', v_profile.points_balance
    );
  end if;

  select coalesce(streak, 0) + 1 into v_streak
  from public.checkins where user_id = p_user_id and business_date = p_business_date - 1;
  v_streak := coalesce(v_streak, 1);
  v_milestone := case
    when v_streak = 3 then 100
    when v_streak = 7 then 300
    when v_streak = 14 then 600
    when v_streak > 14 and mod(v_streak, 7) = 0 then 300
    else 0 end;
  v_surprise := case
    when random() < 0.05 then 50
    when random() < 0.15 then 20
    when random() < 0.50 then 10
    else 0 end;
  v_delta := 100 + v_milestone + v_surprise;

  insert into public.checkins(user_id, business_date, streak, points_delta, surprise_delta)
  values (p_user_id, p_business_date, v_streak, v_delta, v_surprise);
  insert into public.point_ledger(user_id, event_type, delta, idempotency_key, reference_type, metadata)
  values (p_user_id, 'checkin', v_delta, 'checkin:' || p_business_date::text,
    'checkin', jsonb_build_object('streak', v_streak, 'milestone_delta', v_milestone, 'surprise_delta', v_surprise));
  update public.profiles set points_balance = points_balance + v_delta where user_id = p_user_id
  returning points_balance into v_balance;
  return jsonb_build_object('ok', true, 'already_signed', false, 'streak', v_streak,
    'points_delta', v_delta, 'surprise_delta', v_surprise, 'points_balance', v_balance);
exception when unique_violation then
  select * into v_existing from public.checkins where user_id = p_user_id and business_date = p_business_date;
  select points_balance into v_balance from public.profiles where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'already_signed', true, 'streak', v_existing.streak,
    'points_delta', 0, 'points_balance', v_balance);
end;
$$;

revoke all on function public.m1_save_appearance(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.m1_save_appearance(uuid, jsonb) to service_role;
revoke all on function public.m2_sign_checkin(uuid, date) from public, anon, authenticated;
grant execute on function public.m2_sign_checkin(uuid, date) to service_role;
commit;
