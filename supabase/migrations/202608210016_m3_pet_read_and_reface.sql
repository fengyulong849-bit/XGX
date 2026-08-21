-- M3：将桌宠读取和重新捏领导收敛为明确的服务端契约。
begin;

create table if not exists public.pet_appearance_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  appearance jsonb not null,
  pet_status jsonb not null,
  used_free_diy boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.pet_appearance_saves enable row level security;
revoke all on table public.pet_appearance_saves from anon, authenticated;

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
  -- 首次保存消耗注册权益；已保存的外观仍可随时调整。
  -- 只有旧领导倒地时，本次保存才同时创建满血新领导。
  if v_profile.free_diy_available then
    v_used_free := true;
  end if;
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

revoke all on function public.m3_save_appearance(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.m3_save_appearance(uuid, jsonb, uuid) to service_role;
commit;
