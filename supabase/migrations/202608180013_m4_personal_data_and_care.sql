-- M4/M6：个人中心真实数据、共鸣领取及关怀任务服务端结算。
begin;

create or replace function public.m4_list_my_rants(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_items jsonb;
begin
  if p_user_id is null then return jsonb_build_object('ok',false,'reason','invalid_session'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'content', r.content, 'votes', r.votes, 'created_at', r.created_at, 'expires_at', r.expires_at,
    'status', r.status, 'unclaimed_resonances', coalesce(x.unclaimed,0), 'claimed_resonances', coalesce(x.claimed,0)
  ) order by r.created_at desc), '[]'::jsonb) into v_items
  from public.rants r
  left join lateral (
    select (count(*) filter(where owner_claimed_at is null))::integer as unclaimed,
           (count(*) filter(where owner_claimed_at is not null))::integer as claimed
    from public.resonances where rant_id=r.id
  ) x on true
  where r.owner_id=p_user_id;
  return jsonb_build_object('ok',true,'rants',v_items);
end; $$;

create or replace function public.m4_claim_resonance(p_user_id uuid, p_rant_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rant public.rants%rowtype; v_delta_per integer; v_count integer := 0; v_delta integer := 0; v_balance integer;
  v_key text := 'resonance_claim:' || p_request_id::text;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
  select points_balance into v_balance from public.profiles where user_id=p_user_id;
  if exists(select 1 from public.point_ledger where user_id=p_user_id and idempotency_key=v_key) then
    select delta into v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_balance);
  end if;
  select * into v_rant from public.rants where id=p_rant_id and owner_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','rant_unavailable'); end if;
  update public.resonances set owner_claimed_at=now() where rant_id=p_rant_id and owner_id=p_user_id and owner_claimed_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then return jsonb_build_object('ok',false,'reason','nothing_to_claim','points_balance',v_balance); end if;
  select coalesce((value->>'value')::integer,10) into v_delta_per from public.app_config where key='points.resonance_claim';
  v_delta := v_count * coalesce(v_delta_per,10);
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata)
  values(p_user_id,'resonance_claim',v_delta,v_key,'rant',p_rant_id,jsonb_build_object('resonance_count',v_count));
  update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_balance;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_balance,'claimed_count',v_count);
end; $$;

create or replace function public.m4_list_point_ledger(p_user_id uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_items jsonb;
begin
  if p_user_id is null then return jsonb_build_object('ok',false,'reason','invalid_session'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'delta',delta,'created_at',created_at,'metadata',metadata) order by created_at desc),'[]'::jsonb) into v_items
  from (select id,event_type,delta,created_at,metadata from public.point_ledger where user_id=p_user_id order by created_at desc limit least(greatest(coalesce(p_limit,50),1),100)) ledger;
  return jsonb_build_object('ok',true,'entries',v_items);
end; $$;

create or replace function public.m6_complete_care(p_user_id uuid, p_care_type public.care_type, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text := 'care:' || p_care_type::text || ':' || p_request_id::text; v_delta integer; v_cap integer; v_count integer; v_balance integer;
  v_config_key text := case when p_care_type='water' then 'points.care_water' else 'points.care_sit' end;
begin
  if p_user_id is null or p_request_id is null then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
  select points_balance into v_balance from public.profiles where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','profile_not_found'); end if;
  select delta into v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  if found then return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_balance); end if;
  select coalesce((value->>'value')::integer,0), coalesce((value->>'daily_cap')::integer,1) into v_delta,v_cap from public.app_config where key=v_config_key;
  if coalesce(v_delta,0) <= 0 then return jsonb_build_object('ok',false,'reason','invalid_action'); end if;
  select count(*) into v_count from public.point_ledger where user_id=p_user_id and event_type=('care_' || p_care_type::text)::public.point_event_type and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai');
  if v_count >= coalesce(v_cap,1) then return jsonb_build_object('ok',false,'reason','limit_exceeded'); end if;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,metadata) values(p_user_id,('care_' || p_care_type::text)::public.point_event_type,v_delta,v_key,'care',jsonb_build_object('care_type',p_care_type));
  update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_balance;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_balance,'remaining_today',coalesce(v_cap,1)-v_count-1);
end; $$;

revoke all on function public.m4_list_my_rants(uuid) from public, anon, authenticated;
revoke all on function public.m4_claim_resonance(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.m4_list_point_ledger(uuid,integer) from public, anon, authenticated;
revoke all on function public.m6_complete_care(uuid,public.care_type,uuid) from public, anon, authenticated;
grant execute on function public.m4_list_my_rants(uuid) to service_role;
grant execute on function public.m4_claim_resonance(uuid,uuid,uuid) to service_role;
grant execute on function public.m4_list_point_ledger(uuid,integer) to service_role;
grant execute on function public.m6_complete_care(uuid,public.care_type,uuid) to service_role;
commit;
