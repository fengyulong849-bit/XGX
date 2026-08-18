-- M4 修正：共鸣重放、每日奖励上限和返回数据保持一致。
begin;

create or replace function public.m4_create_resonance(p_user_id uuid, p_rant_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype; v_res public.resonances%rowtype; v_delta integer := 0;
  v_cap integer := 10; v_daily integer := 0; v_votes integer; v_points integer;
  v_key text := 'resonance_give:' || p_request_id::text;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
  select * into v_res from public.resonances where actor_id=p_user_id and idempotency_key=v_key;
  if found then
    select votes into v_votes from public.rants where id=v_res.rant_id;
    select points_balance into v_points from public.profiles where user_id=p_user_id;
    select count(*) into v_daily from public.resonances where actor_id=p_user_id and clicker_rewarded=true and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai');
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'points_balance',v_points,'votes',coalesce(v_votes,0),'clicker_rewarded_today',v_daily,'clicker_reward_cap',v_cap);
  end if;
  select * into v_rant from public.rants where id=p_rant_id for update;
  if not found or v_rant.status <> 'published' or v_rant.review_status <> 'approved' or v_rant.expires_at <= now() then return jsonb_build_object('ok',false,'reason','rant_unavailable'); end if;
  if v_rant.owner_id = p_user_id then return jsonb_build_object('ok',false,'reason','self_resonance'); end if;
  select * into v_res from public.resonances where actor_id=p_user_id and rant_id=p_rant_id;
  if found then
    select points_balance into v_points from public.profiles where user_id=p_user_id;
    select count(*) into v_daily from public.resonances where actor_id=p_user_id and clicker_rewarded=true and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai');
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'points_balance',v_points,'votes',v_rant.votes,'clicker_rewarded_today',v_daily,'clicker_reward_cap',v_cap);
  end if;
  select count(*) into v_daily from public.resonances where actor_id=p_user_id and clicker_rewarded=true and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai');
  if v_daily < v_cap then select coalesce((value->>'value')::integer,10) into v_delta from public.app_config where key='points.resonance_give'; v_delta := coalesce(v_delta,10); end if;
  insert into public.resonances(rant_id,actor_id,owner_id,idempotency_key,clicker_rewarded) values(p_rant_id,p_user_id,v_rant.owner_id,v_key,v_delta>0) returning * into v_res;
  update public.rants set votes=votes+1 where id=p_rant_id returning votes into v_votes;
  if v_delta > 0 then
    insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'resonance_give',v_delta,v_key,'resonance',v_res.id,jsonb_build_object('rant_id',p_rant_id));
    update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_points;
  else select points_balance into v_points from public.profiles where user_id=p_user_id; end if;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_points,'clicker_rewarded_today',v_daily + case when v_delta>0 then 1 else 0 end,'clicker_reward_cap',v_cap,'votes',v_votes);
exception when unique_violation then
  select points_balance into v_points from public.profiles where user_id=p_user_id;
  select votes into v_votes from public.rants where id=p_rant_id;
  select count(*) into v_daily from public.resonances where actor_id=p_user_id and clicker_rewarded=true and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai');
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'points_balance',v_points,'votes',coalesce(v_votes,0),'clicker_rewarded_today',v_daily,'clicker_reward_cap',v_cap);
end; $$;

revoke all on function public.m4_create_resonance(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.m4_create_resonance(uuid,uuid,uuid) to service_role;
commit;
