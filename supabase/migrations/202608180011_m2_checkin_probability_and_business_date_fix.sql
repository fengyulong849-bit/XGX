-- M2 修正：签到惊喜使用同一次随机结果，业务日统一按 Asia/Shanghai。
begin;

create or replace function public.m2_sign_checkin(p_user_id uuid, p_business_date date default public.business_date())
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
  v_roll numeric := random();
begin
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'profile_not_found'); end if;
  select * into v_existing from public.checkins where user_id = p_user_id and business_date = p_business_date;
  if found then return jsonb_build_object('ok', true, 'already_signed', true, 'streak', v_existing.streak, 'points_delta', 0, 'points_balance', v_profile.points_balance); end if;
  select coalesce(streak, 0) + 1 into v_streak from public.checkins where user_id = p_user_id and business_date = p_business_date - 1;
  v_streak := coalesce(v_streak, 1);
  v_milestone := case when v_streak = 3 then 100 when v_streak = 7 then 300 when v_streak = 14 then 600 when v_streak > 14 and mod(v_streak, 7) = 0 then 300 else 0 end;
  v_surprise := case when v_roll < 0.05 then 50 when v_roll < 0.20 then 20 when v_roll < 0.50 then 10 else 0 end;
  v_delta := 100 + v_milestone + v_surprise;
  insert into public.checkins(user_id, business_date, streak, points_delta, surprise_delta) values (p_user_id, p_business_date, v_streak, v_delta, v_surprise);
  insert into public.point_ledger(user_id, event_type, delta, idempotency_key, reference_type, metadata) values (p_user_id, 'checkin', v_delta, 'checkin:' || p_business_date::text, 'checkin', jsonb_build_object('streak', v_streak, 'milestone_delta', v_milestone, 'surprise_delta', v_surprise));
  update public.profiles set points_balance = points_balance + v_delta where user_id = p_user_id returning points_balance into v_balance;
  return jsonb_build_object('ok', true, 'already_signed', false, 'streak', v_streak, 'points_delta', v_delta, 'surprise_delta', v_surprise, 'points_balance', v_balance);
exception when unique_violation then
  select * into v_existing from public.checkins where user_id = p_user_id and business_date = p_business_date;
  select points_balance into v_balance from public.profiles where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'already_signed', true, 'streak', v_existing.streak, 'points_delta', 0, 'points_balance', v_balance);
end;
$$;

revoke all on function public.m2_sign_checkin(uuid, date) from public, anon, authenticated;
grant execute on function public.m2_sign_checkin(uuid, date) to service_role;
commit;
