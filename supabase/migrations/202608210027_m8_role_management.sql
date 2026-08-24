-- M8：管理员受控管理 moderator 角色。禁止通过业务接口创建或变更 admin。
begin;

create table if not exists public.moderation_role_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('grant', 'revoke')),
  role public.moderator_role not null default 'moderator',
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint moderation_role_actions_request_once unique (actor_id, request_id)
);

create index if not exists moderation_role_actions_target_created_idx
on public.moderation_role_actions (target_id, created_at desc);

alter table public.moderation_role_actions enable row level security;
revoke all on table public.moderation_role_actions from anon, authenticated;

create or replace function public.m8_manage_moderator(
  p_admin_id uuid,
  p_target_id uuid,
  p_action text,
  p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_previous public.moderation_role_actions%rowtype;
  v_target_exists boolean;
begin
  if not exists (select 1 from public.user_roles where user_id = p_admin_id and role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_target_id is null or p_request_id is null or p_action is null or p_action not in ('grant', 'revoke') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if p_admin_id = p_target_id and p_action = 'revoke' then
    return jsonb_build_object('ok', false, 'reason', 'cannot_revoke_self');
  end if;
  select exists(select 1 from auth.users where id = p_target_id) into v_target_exists;
  if not v_target_exists then return jsonb_build_object('ok', false, 'reason', 'user_unavailable'); end if;
  if exists (select 1 from public.user_roles where user_id = p_target_id and role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'admin_role_protected');
  end if;

  select * into v_previous from public.moderation_role_actions
  where actor_id = p_admin_id and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'action', v_previous.action, 'role', v_previous.role);
  end if;

  if p_action = 'grant' then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_target_id, 'moderator', p_admin_id)
    on conflict (user_id) do update set role = 'moderator', granted_by = p_admin_id, granted_at = now();
  else
    delete from public.user_roles where user_id = p_target_id and role = 'moderator';
  end if;

  insert into public.moderation_role_actions (actor_id, target_id, action, role, request_id)
  values (p_admin_id, p_target_id, p_action, 'moderator', p_request_id);
  return jsonb_build_object('ok', true, 'replayed', false, 'action', p_action, 'role', 'moderator');
exception when unique_violation then
  select * into v_previous from public.moderation_role_actions
  where actor_id = p_admin_id and request_id = p_request_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'action', v_previous.action, 'role', v_previous.role);
end;
$$;

revoke all on function public.m8_manage_moderator(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.m8_manage_moderator(uuid, uuid, text, uuid) to service_role;
commit;
