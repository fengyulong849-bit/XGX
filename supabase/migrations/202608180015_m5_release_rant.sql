-- M5：释怀仪式服务端销毁与 24 小时奖励，使用请求键保证重放安全。
begin;

create or replace function public.m5_release_rant(p_user_id uuid, p_rant_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype; v_previous jsonb; v_delta integer := 0; v_balance integer;
  v_min_age integer := 24; v_eligible boolean; v_key text := 'release_complete:' || p_request_id::text;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_request'); end if;
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  if found then
    select points_balance into v_balance from public.profiles where user_id=p_user_id;
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_balance,'eligible',coalesce((v_previous->>'eligible')::boolean,false));
  end if;
  select * into v_rant from public.rants where id=p_rant_id and owner_id=p_user_id for update;
  if not found or v_rant.status in ('destroyed','expired','rejected') then return jsonb_build_object('ok',false,'reason','rant_unavailable'); end if;
  select coalesce((value->>'value')::integer,100), coalesce((value->>'minimum_age_hours')::integer,24) into v_delta,v_min_age from public.app_config where key='points.release_complete';
  v_eligible := v_rant.created_at <= now() - make_interval(hours => coalesce(v_min_age,24));
  if not v_eligible then v_delta := 0; end if;
  update public.rants set status='destroyed',destroyed_at=now(),release_rewarded_at=case when v_eligible then now() else null end where id=p_rant_id;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'release_complete',v_delta,v_key,'rant',p_rant_id,jsonb_build_object('eligible',v_eligible,'rant_id',p_rant_id));
  update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_balance;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_balance,'eligible',v_eligible,'rant_id',p_rant_id);
exception when unique_violation then
  select metadata,delta into v_previous,v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  select points_balance into v_balance from public.profiles where user_id=p_user_id;
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_balance,'eligible',coalesce((v_previous->>'eligible')::boolean,false));
end; $$;

revoke all on function public.m5_release_rant(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.m5_release_rant(uuid,uuid,uuid) to service_role;
commit;
