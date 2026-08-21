-- M4：匿名吐槽举报。达到不同用户举报阈值后仅隐藏公开展示，保留记录供人工核查。
begin;

insert into public.app_config(key, value)
values ('limits.rant_reports_to_hide', '{"value":3}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.rant_reports (
  id uuid primary key default gen_random_uuid(),
  rant_id uuid not null references public.rants(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('privacy', 'abuse', 'other')),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint rant_reports_one_per_user unique (rant_id, reporter_id),
  constraint rant_reports_request_once unique (reporter_id, request_id)
);

create index if not exists rant_reports_rant_created_idx on public.rant_reports(rant_id, created_at desc);
alter table public.rant_reports enable row level security;
revoke all on table public.rant_reports from anon, authenticated;

create or replace function public.m4_report_rant(p_user_id uuid, p_rant_id uuid, p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype;
  v_previous public.rant_reports%rowtype;
  v_count integer;
  v_threshold integer;
  v_hidden boolean := false;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null or p_reason not in ('privacy', 'abuse', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  select * into v_previous from public.rant_reports where reporter_id = p_user_id and request_id = p_request_id;
  if found then
    select count(*) into v_count from public.rant_reports where rant_id = v_previous.rant_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'report_count', v_count, 'hidden', false);
  end if;
  select * into v_rant from public.rants where id = p_rant_id for update;
  if not found or v_rant.status <> 'published' or v_rant.review_status <> 'approved' or v_rant.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'rant_unavailable');
  end if;
  if v_rant.owner_id = p_user_id then return jsonb_build_object('ok', false, 'reason', 'self_report'); end if;
  select * into v_previous from public.rant_reports where rant_id = p_rant_id and reporter_id = p_user_id;
  if found then
    select count(*) into v_count from public.rant_reports where rant_id = p_rant_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'report_count', v_count, 'hidden', false);
  end if;
  insert into public.rant_reports(rant_id, reporter_id, reason, request_id) values (p_rant_id, p_user_id, p_reason, p_request_id);
  select count(*) into v_count from public.rant_reports where rant_id = p_rant_id;
  select coalesce((value ->> 'value')::integer, 3) into v_threshold from public.app_config where key = 'limits.rant_reports_to_hide';
  if v_count >= coalesce(v_threshold, 3) then
    update public.rants set review_status = 'hidden' where id = p_rant_id and review_status = 'approved';
    v_hidden := found;
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'report_count', v_count, 'hidden', v_hidden);
exception when unique_violation then
  select count(*) into v_count from public.rant_reports where rant_id = p_rant_id;
  return jsonb_build_object('ok', true, 'replayed', true, 'report_count', v_count, 'hidden', false);
end;
$$;

revoke all on function public.m4_report_rant(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.m4_report_rant(uuid, uuid, text, uuid) to service_role;
commit;
