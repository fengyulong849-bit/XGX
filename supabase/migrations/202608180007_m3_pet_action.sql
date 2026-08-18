-- M3：桌宠互动的服务端原子结算。
begin;

create or replace function public.m3_pet_action(
  p_user_id uuid,
  p_action public.pet_action,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_status jsonb;
  v_previous jsonb;
  v_locked_until timestamptz;
  v_endure integer;
  v_irritate integer;
  v_fat integer;
  v_dirty integer;
  v_points integer;
  v_delta integer;
  v_event text := null;
  v_lock_until timestamptz := null;
  v_key text := 'pet_action:' || p_request_id::text;
begin
  if p_user_id is null or p_request_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;

  select metadata, delta into v_previous, v_delta
  from public.point_ledger
  where user_id = p_user_id and idempotency_key = v_key;
  if found then
    select points_balance into v_points from public.profiles where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'points_delta', v_delta,
      'points_balance', v_points, 'pet_status', v_previous->'pet_status', 'event', v_previous->>'event');
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'profile_not_found'); end if;
  v_status := coalesce(v_profile.pet_status, '{}'::jsonb);
  v_locked_until := nullif(v_status->>'locked_until', '')::timestamptz;
  if coalesce((v_status->>'down')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'pet_down');
  end if;
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'pet_locked', 'locked_until', v_locked_until);
  end if;

  select coalesce((value->>'value')::integer, 10) into v_delta
  from public.app_config where key = 'points.pet_action';
  v_delta := coalesce(v_delta, 10);
  v_endure := greatest(0, least(100, coalesce((v_status->>'endure')::integer, 100)));
  v_irritate := greatest(0, least(100, coalesce((v_status->>'irritate')::integer, 0)));
  v_fat := greatest(0, least(100, coalesce((v_status->>'fat')::integer, 0)));
  v_dirty := greatest(0, least(100, coalesce((v_status->>'dirty')::integer, 0)));

  case p_action
    when 'poke' then v_endure := greatest(0, v_endure - 4); v_irritate := least(100, v_irritate + 8);
    when 'slap' then
      v_endure := greatest(0, v_endure - 20); v_lock_until := now() + interval '5 seconds';
    when 'feed' then
      v_endure := greatest(0, v_endure - 20); v_fat := least(100, v_fat + 20);
      if v_fat >= 100 then v_fat := 35; v_event := 'burst'; end if;
    when 'throw' then
      v_endure := greatest(0, v_endure - 20); v_dirty := least(100, v_dirty + 20);
      if v_dirty >= 100 then v_dirty := 20; v_event := 'faint'; end if;
  end case;
  if v_endure <= 0 then v_lock_until := null; end if;

  v_status := jsonb_build_object(
    'endure', v_endure, 'irritate', v_irritate, 'fat', v_fat, 'dirty', v_dirty,
    'down', v_endure <= 0, 'locked_until', v_lock_until
  );
  update public.profiles set pet_status = v_status where user_id = p_user_id;
  insert into public.point_ledger(user_id, event_type, delta, idempotency_key, reference_type, metadata)
  values (p_user_id, 'pet_action', v_delta, v_key, 'pet_action',
    jsonb_build_object('action', p_action::text, 'pet_status', v_status, 'event', v_event));
  update public.profiles set points_balance = points_balance + v_delta
  where user_id = p_user_id returning points_balance into v_points;
  return jsonb_build_object('ok', true, 'replayed', false, 'points_delta', v_delta,
    'points_balance', v_points, 'pet_status', v_status, 'event', v_event);
exception when unique_violation then
  select metadata, delta into v_previous, v_delta from public.point_ledger
  where user_id = p_user_id and idempotency_key = v_key;
  select points_balance into v_points from public.profiles where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'points_delta', v_delta,
    'points_balance', v_points, 'pet_status', v_previous->'pet_status', 'event', v_previous->>'event');
end;
$$;

revoke all on function public.m3_pet_action(uuid, public.pet_action, uuid) from public, anon, authenticated;
grant execute on function public.m3_pet_action(uuid, public.pet_action, uuid) to service_role;
commit;
