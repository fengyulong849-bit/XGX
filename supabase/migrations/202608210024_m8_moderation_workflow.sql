-- M8：受控举报审核。浏览器普通用户不可读取举报数据或调用审核 RPC。
begin;

do $$
begin
  create type public.moderator_role as enum ('moderator', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.moderator_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create table if not exists public.rant_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  rant_id uuid not null references public.rants(id) on delete cascade,
  moderator_id uuid not null references auth.users(id) on delete cascade,
  decision public.review_status not null check (decision in ('approved', 'hidden', 'rejected')),
  note text not null default '' check (length(note) <= 500),
  request_id uuid not null,
  resulting_review_status public.review_status not null,
  created_at timestamptz not null default now(),
  constraint rant_moderation_actions_request_once unique (moderator_id, request_id)
);

create index if not exists rant_moderation_actions_rant_created_idx
on public.rant_moderation_actions (rant_id, created_at desc);

alter table public.user_roles enable row level security;
alter table public.rant_moderation_actions enable row level security;
revoke all on table public.user_roles, public.rant_moderation_actions from anon, authenticated;

create or replace function public.m8_is_moderator(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role in ('moderator', 'admin')
  );
$$;

create or replace function public.m8_moderation_queue(p_moderator_id uuid, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
begin
  if not public.m8_is_moderator(p_moderator_id) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(jsonb_agg(item order by (item->>'report_count')::integer desc, item->>'created_at' asc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'rant_id', r.id,
      'content', r.content,
      'created_at', r.created_at,
      'expires_at', r.expires_at,
      'review_status', r.review_status,
      'report_count', count(rr.id),
      'reasons', coalesce(jsonb_agg(distinct rr.reason) filter (where rr.reason is not null), '[]'::jsonb)
    ) as item
    from public.rants r
    join public.rant_reports rr on rr.rant_id = r.id
    where r.status = 'published' and r.expires_at > now() and r.review_status in ('approved', 'hidden')
    group by r.id
    order by count(rr.id) desc, r.created_at asc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) queue;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

create or replace function public.m8_review_rant(
  p_moderator_id uuid,
  p_rant_id uuid,
  p_decision public.review_status,
  p_note text,
  p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_previous public.rant_moderation_actions%rowtype;
  v_status public.review_status;
  v_note text := trim(coalesce(p_note, ''));
begin
  if not public.m8_is_moderator(p_moderator_id) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_rant_id is null or p_request_id is null or p_decision is null or p_decision not in ('approved', 'hidden', 'rejected') or length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  select * into v_previous from public.rant_moderation_actions
  where moderator_id = p_moderator_id and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'review_status', v_previous.resulting_review_status);
  end if;

  select review_status into v_status from public.rants
  where id = p_rant_id and status = 'published' and expires_at > now() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'rant_unavailable'); end if;

  update public.rants set review_status = p_decision where id = p_rant_id;
  insert into public.rant_moderation_actions (
    rant_id, moderator_id, decision, note, request_id, resulting_review_status
  ) values (p_rant_id, p_moderator_id, p_decision, v_note, p_request_id, p_decision);
  return jsonb_build_object('ok', true, 'replayed', false, 'review_status', p_decision);
exception when unique_violation then
  select * into v_previous from public.rant_moderation_actions
  where moderator_id = p_moderator_id and request_id = p_request_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'review_status', v_previous.resulting_review_status);
end;
$$;

revoke all on function public.m8_is_moderator(uuid) from public, anon, authenticated;
revoke all on function public.m8_moderation_queue(uuid, integer) from public, anon, authenticated;
revoke all on function public.m8_review_rant(uuid, uuid, public.review_status, text, uuid) from public, anon, authenticated;
grant execute on function public.m8_moderation_queue(uuid, integer) to service_role;
grant execute on function public.m8_review_rant(uuid, uuid, public.review_status, text, uuid) to service_role;
commit;
