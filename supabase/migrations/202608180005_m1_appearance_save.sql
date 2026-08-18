-- M1：保存当前账号的捏脸外观配置。
begin;

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
  ) where user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.m1_save_appearance(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.m1_save_appearance(uuid, jsonb) to service_role;
commit;
