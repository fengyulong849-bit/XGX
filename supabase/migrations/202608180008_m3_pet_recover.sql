-- M3：倒地后的服务端复活结算。
begin;

create or replace function public.m3_pet_recover(p_user_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_previous jsonb;
  v_delta integer;
  v_cost integer;
  v_balance integer;
  v_key text := 'pet_recover:' || p_request_id::text;
  v_status jsonb;
begin
  if p_user_id is null or p_request_id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_request'); end if;
  select metadata, delta into v_previous, v_delta from public.point_ledger
  where user_id = p_user_id and idempotency_key = v_key;
  if found then
    select points_balance, pet_status into v_balance, v_status from public.profiles where user_id=p_user_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'points_delta', v_delta, 'points_balance', v_balance, 'pet_status', v_status);
  end if;
  select * into v_profile from public.profiles where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'profile_not_found'); end if;
  if not coalesce((v_profile.pet_status->>'down')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'pet_not_down');
  end if;
  select coalesce((value->>'value')::integer, -500) into v_cost from public.app_config where key='points.pet_revive';
  v_cost := coalesce(v_cost, -500);
  if v_profile.points_balance < abs(v_cost) then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_points', 'points_balance', v_profile.points_balance, 'cost', abs(v_cost));
  end if;
  v_status := jsonb_build_object('endure',100,'irritate',20,'fat',10,'dirty',5,'down',false,'locked_until',null);
  update public.profiles set pet_status=v_status, points_balance=points_balance+v_cost
  where user_id=p_user_id returning points_balance into v_balance;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,metadata)
  values(p_user_id,'pet_revive',v_cost,v_key,'pet_revive',jsonb_build_object('pet_status',v_status));
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_cost,'points_balance',v_balance,'pet_status',v_status);
exception when unique_violation then
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  select points_balance, pet_status into v_balance, v_status from public.profiles where user_id=p_user_id;
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_balance,'pet_status',v_status);
end;
$$;

revoke all on function public.m3_pet_recover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.m3_pet_recover(uuid, uuid) to service_role;
commit;
