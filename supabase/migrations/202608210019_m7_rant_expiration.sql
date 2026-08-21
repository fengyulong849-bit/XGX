-- M7：匿名发声到期生命周期。公开读取本已实时过滤 expires_at；本迁移补齐状态归档和操作侧兜底。
begin;

create or replace function public.m7_expire_rants()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_expired integer := 0;
begin
  update public.rants
  set status = 'expired'
  where status = 'published'
    and expires_at <= now();
  get diagnostics v_expired = row_count;
  return jsonb_build_object('ok', true, 'expired_count', v_expired);
end; $$;

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
  where r.owner_id=p_user_id
    and (r.status <> 'published' or r.expires_at > now());
  return jsonb_build_object('ok',true,'rants',v_items);
end; $$;

create or replace function public.m5_release_rant(p_user_id uuid, p_rant_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype; v_previous jsonb; v_delta integer := 0; v_balance integer;
  v_min_age integer := 24; v_eligible boolean; v_key text := 'release_complete:' || p_request_id::text;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_request'); end if;
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id = p_user_id and idempotency_key = v_key;
  if found then
    select points_balance into v_balance from public.profiles where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'points_delta', v_delta, 'points_balance', v_balance, 'eligible', coalesce((v_previous->>'eligible')::boolean, false));
  end if;
  select * into v_rant from public.rants where id = p_rant_id and owner_id = p_user_id for update;
  if not found or v_rant.status in ('destroyed', 'expired', 'rejected') then return jsonb_build_object('ok', false, 'reason', 'rant_unavailable'); end if;
  if v_rant.expires_at <= now() then
    update public.rants set status = 'expired' where id = p_rant_id;
    return jsonb_build_object('ok', false, 'reason', 'rant_unavailable');
  end if;
  select coalesce((value->>'value')::integer, 100), coalesce((value->>'minimum_age_hours')::integer, 24) into v_delta, v_min_age from public.app_config where key = 'points.release_complete';
  v_eligible := v_rant.created_at <= now() - make_interval(hours => coalesce(v_min_age, 24));
  if not v_eligible then v_delta := 0; end if;
  update public.rants set status = 'destroyed', destroyed_at = now(), release_rewarded_at = case when v_eligible then now() else null end where id = p_rant_id;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata)
    values (p_user_id, 'release_complete', v_delta, v_key, 'rant', p_rant_id, jsonb_build_object('eligible', v_eligible, 'rant_id', p_rant_id));
  update public.profiles set points_balance = points_balance + v_delta where user_id = p_user_id returning points_balance into v_balance;
  return jsonb_build_object('ok', true, 'replayed', false, 'points_delta', v_delta, 'points_balance', v_balance, 'eligible', v_eligible, 'rant_id', p_rant_id);
exception when unique_violation then
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id = p_user_id and idempotency_key = v_key;
  select points_balance into v_balance from public.profiles where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'points_delta', v_delta, 'points_balance', v_balance, 'eligible', coalesce((v_previous->>'eligible')::boolean, false));
end; $$;

revoke all on function public.m7_expire_rants() from public, anon, authenticated;
revoke all on function public.m4_list_my_rants(uuid) from public, anon, authenticated;
revoke all on function public.m5_release_rant(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.m7_expire_rants() to service_role;
grant execute on function public.m4_list_my_rants(uuid) to service_role;
grant execute on function public.m5_release_rant(uuid,uuid,uuid) to service_role;
commit;
