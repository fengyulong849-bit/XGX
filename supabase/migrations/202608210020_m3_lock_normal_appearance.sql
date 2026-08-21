-- 正常领导不可重新 DIY：首次创建或倒地重捏以外的保存请求一律拒绝。
create or replace function public.m3_save_appearance(p_user_id uuid, p_appearance jsonb, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_saved public.pet_appearance_saves%rowtype;
  v_key text;
  v_max integer;
  v_status jsonb;
  v_used_free boolean := false;
  v_free_available boolean := false;
begin
  if p_user_id is null or p_request_id is null or jsonb_typeof(p_appearance) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  for v_key, v_max in select * from (values
    ('face', 2), ('hair', 3), ('glasses', 2), ('beard', 2),
    ('expr', 3), ('suit', 3), ('belly', 2), ('skin', 3)
  ) as allowed(key, max_value)
  loop
    if not (p_appearance ? v_key) or jsonb_typeof(p_appearance -> v_key) <> 'number'
      or (p_appearance ->> v_key)::integer < 0 or (p_appearance ->> v_key)::integer > v_max then
      return jsonb_build_object('ok', false, 'reason', 'invalid_appearance');
    end if;
  end loop;

  select * into v_saved from public.pet_appearance_saves where user_id = p_user_id and request_id = p_request_id;
  if found then
    select free_diy_available into v_free_available from public.profiles where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'appearance', v_saved.appearance,
      'pet_status', v_saved.pet_status, 'used_free_diy', v_saved.used_free_diy, 'free_diy_available', coalesce(v_free_available, false));
  end if;

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'profile_not_found'); end if;
  if v_profile.appearance is not null and not coalesce((v_profile.pet_status ->> 'down')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'appearance_locked');
  end if;

  v_used_free := v_profile.free_diy_available;
  if coalesce((v_profile.pet_status ->> 'down')::boolean, false) then
    v_status := jsonb_build_object('endure', 100, 'irritate', 20, 'fat', 10, 'dirty', 5, 'down', false, 'locked_until', null);
  else
    v_status := v_profile.pet_status;
  end if;
  update public.profiles set appearance = jsonb_build_object(
    'face', (p_appearance ->> 'face')::integer, 'hair', (p_appearance ->> 'hair')::integer,
    'glasses', (p_appearance ->> 'glasses')::integer, 'beard', (p_appearance ->> 'beard')::integer,
    'expr', (p_appearance ->> 'expr')::integer, 'suit', (p_appearance ->> 'suit')::integer,
    'belly', (p_appearance ->> 'belly')::integer, 'skin', (p_appearance ->> 'skin')::integer
  ), free_diy_available = false, pet_status = v_status where user_id = p_user_id;
  insert into public.pet_appearance_saves(user_id, request_id, appearance, pet_status, used_free_diy)
  values (p_user_id, p_request_id, p_appearance, v_status, v_used_free);
  return jsonb_build_object('ok', true, 'replayed', false, 'appearance', p_appearance,
    'pet_status', v_status, 'used_free_diy', v_used_free, 'free_diy_available', false);
exception when unique_violation then
  select * into v_saved from public.pet_appearance_saves where user_id = p_user_id and request_id = p_request_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'appearance', v_saved.appearance,
    'pet_status', v_saved.pet_status, 'used_free_diy', v_saved.used_free_diy, 'free_diy_available', false);
end;
$$;
