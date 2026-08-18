-- M4：匿名吐槽、随机墙与共鸣的服务端基础。
begin;

create table if not exists public.rants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(content) between 1 and 50),
  status public.rant_status not null default 'published',
  review_status public.review_status not null default 'approved',
  votes integer not null default 0 check (votes >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 days'),
  destroyed_at timestamptz,
  release_rewarded_at timestamptz
);
create index if not exists rants_public_random_idx on public.rants(status, review_status, expires_at);
create index if not exists rants_owner_created_idx on public.rants(owner_id, created_at desc);

create table if not exists public.resonances (
  id uuid primary key default gen_random_uuid(),
  rant_id uuid not null references public.rants(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  clicker_rewarded boolean not null default false,
  owner_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint resonances_once_per_rant unique(rant_id, actor_id),
  constraint resonances_request_once unique(actor_id, idempotency_key),
  constraint resonances_not_self check(actor_id <> owner_id)
);
create index if not exists resonances_owner_idx on public.resonances(owner_id, owner_claimed_at);

alter table public.rants enable row level security;
alter table public.resonances enable row level security;
drop policy if exists rants_select_own on public.rants;
create policy rants_select_own on public.rants for select to authenticated using (owner_id = auth.uid());
drop policy if exists resonances_select_own on public.resonances;
create policy resonances_select_own on public.resonances for select to authenticated using (owner_id = auth.uid() or actor_id = auth.uid());
revoke insert, update, delete on public.rants, public.resonances from anon, authenticated;
grant select on public.rants, public.resonances to authenticated;

create or replace function public.m4_create_rant(p_user_id uuid, p_content text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype;
  v_previous jsonb;
  v_points integer;
  v_delta integer;
  v_limit integer;
  v_key text := 'rant_publish:' || p_request_id::text;
  v_content text := regexp_replace(trim(coalesce(p_content, '')), '\s+', ' ', 'g');
begin
  if p_user_id is null or p_request_id is null or length(v_content) < 1 or length(v_content) > 50 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_content');
  end if;
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  if found then
    select points_balance into v_points from public.profiles where user_id=p_user_id;
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_points,'rant',v_previous->'rant');
  end if;
  select coalesce((value->>'value')::integer,3) into v_limit from public.app_config where key='limits.rants_per_day';
  if (select count(*) from public.rants where owner_id=p_user_id and created_at >= date_trunc('day', now())) >= coalesce(v_limit,3) then
    return jsonb_build_object('ok',false,'reason','limit_exceeded');
  end if;
  select coalesce((value->>'value')::integer,50) into v_delta from public.app_config where key='points.rant_publish';
  v_delta := coalesce(v_delta,50);
  insert into public.rants(owner_id,content) values(p_user_id,v_content) returning * into v_rant;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata)
  values(p_user_id,'rant_publish',v_delta,v_key,'rant',v_rant.id,jsonb_build_object('rant',jsonb_build_object('id',v_rant.id,'content',v_rant.content,'votes',0,'created_at',v_rant.created_at,'expires_at',v_rant.expires_at)));
  update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_points;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_points,'remaining_today',coalesce(v_limit,3)-1,
    'rant',jsonb_build_object('id',v_rant.id,'content',v_rant.content,'votes',v_rant.votes,'created_at',v_rant.created_at,'expires_at',v_rant.expires_at));
exception when unique_violation then
  select metadata, delta into v_previous, v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  select points_balance into v_points from public.profiles where user_id=p_user_id;
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_points,'rant',v_previous->'rant');
end; $$;

create or replace function public.m4_create_resonance(p_user_id uuid, p_rant_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rant public.rants%rowtype;
  v_res public.resonances%rowtype;
  v_delta integer := 0;
  v_cap integer := 10;
  v_daily integer;
  v_votes integer;
  v_points integer;
  v_key text := 'resonance_give:' || p_request_id::text;
begin
  if p_user_id is null or p_rant_id is null or p_request_id is null then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
  select * into v_rant from public.rants where id=p_rant_id for update;
  if not found or v_rant.status <> 'published' or v_rant.review_status <> 'approved' or v_rant.expires_at <= now() then
    return jsonb_build_object('ok',false,'reason','rant_unavailable');
  end if;
  if v_rant.owner_id = p_user_id then return jsonb_build_object('ok',false,'reason','self_resonance'); end if;
  select * into v_res from public.resonances where actor_id=p_user_id and (idempotency_key=v_key or rant_id=p_rant_id);
  if found then return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'votes',v_rant.votes); end if;
  select count(*) into v_daily from public.resonances where actor_id=p_user_id and created_at >= date_trunc('day',now());
  if v_daily < v_cap then
    select coalesce((value->>'value')::integer,10) into v_delta from public.app_config where key='points.resonance_give';
    v_delta := coalesce(v_delta,10);
  end if;
  insert into public.resonances(rant_id,actor_id,owner_id,idempotency_key,clicker_rewarded)
  values(p_rant_id,p_user_id,v_rant.owner_id,v_key,v_delta>0) returning * into v_res;
  update public.rants set votes=votes+1 where id=p_rant_id returning votes into v_votes;
  if v_delta > 0 then
    insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata)
    values(p_user_id,'resonance_give',v_delta,v_key,'resonance',v_res.id,jsonb_build_object('rant_id',p_rant_id));
    update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_points;
  else
    select points_balance into v_points from public.profiles where user_id=p_user_id;
  end if;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_points,'clicker_rewarded_today',v_daily + case when v_delta>0 then 1 else 0 end,'clicker_reward_cap',v_cap,'votes',v_votes);
exception when unique_violation then
  select points_balance into v_points from public.profiles where user_id=p_user_id;
  select votes into v_votes from public.rants where id=p_rant_id;
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'points_balance',v_points,'votes',v_votes);
end; $$;

revoke all on function public.m4_create_rant(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.m4_create_resonance(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.m4_create_rant(uuid,text,uuid) to service_role;
grant execute on function public.m4_create_resonance(uuid,uuid,uuid) to service_role;
commit;
