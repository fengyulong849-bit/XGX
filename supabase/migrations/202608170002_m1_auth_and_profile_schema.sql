-- 小确闲 M1：账号映射、最小个人档案、欢迎积分、恢复码和认证限流。
-- 仅 Edge Function（Service Role）可调用标注为 m1_* 的内部函数；浏览器没有业务表写权限。

begin;

-- 对外展示“账号”，底层 Auth 仍使用内部派生的不可投递登录标识。
-- 账号及映射从不出现在公开吐槽或公共查询中。
create table public.account_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_display text not null,
  account_normalized text not null unique,
  login_email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_credentials_account_format
    check (account_normalized ~ '^[a-z0-9_]{4,20}$'),
  constraint account_credentials_normalized_lowercase
    check (account_normalized = lower(account_normalized)),
  constraint account_credentials_internal_email
    check (login_email ~ '^[a-z0-9_]{4,20}@accounts[.]xqx[.]invalid$')
);

create trigger set_account_credentials_updated_at
before update on public.account_credentials
for each row execute function public.set_updated_at();

-- M2 会扩展本表；M1 只保留注册后即可安全初始化的字段。
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points_balance integer not null default 0 check (points_balance >= 0),
  free_diy_available boolean not null default true,
  appearance jsonb,
  pet_status jsonb not null default jsonb_build_object(
    'endure', 100,
    'irritate', 0,
    'fat', 0,
    'dirty', 0,
    'down', false,
    'locked_until', null
  ),
  off_hour smallint not null default 18 check (off_hour between 0 and 23),
  off_min smallint not null default 0 check (off_min between 0 and 59),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 余额只是聚合值；每一次变更必须有一条不可由客户端伪造的流水。
create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type public.point_event_type not null,
  delta integer not null check (delta <> 0),
  idempotency_key text not null,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint point_ledger_idempotency_unique unique (user_id, idempotency_key)
);

create index point_ledger_user_created_at_idx
on public.point_ledger (user_id, created_at desc);

-- 恢复码只保存来自 Edge Function 的 PBKDF2+pepper 哈希；明文不会进入此表。
create table public.account_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz,
  reserved_until timestamptz,
  constraint account_recovery_codes_hash_not_empty check (length(code_hash) >= 64)
);

create unique index account_recovery_codes_one_active_per_user_idx
on public.account_recovery_codes (user_id)
where revoked_at is null and used_at is null;

-- 重置流程先短时保留恢复码，再由 Edge Function 修改 Auth 密码并完成轮换，防止并发重复使用。
create table public.account_recovery_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recovery_code_id uuid not null references public.account_recovery_codes(id) on delete cascade,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index account_recovery_resets_one_open_per_code_idx
on public.account_recovery_resets (recovery_code_id)
where completed_at is null;

-- 注册请求可追溯且防止同一 request_id 反复初始化欢迎积分。
create table public.account_registration_requests (
  request_id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  account_normalized text not null unique,
  created_at timestamptz not null default now()
);

-- 认证接口限流状态。subject_hash 由 Edge Function 对账号/IP 等输入做哈希后传入。
create table public.auth_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash),
  constraint auth_rate_limits_scope_format check (scope ~ '^[a-z][a-z0-9_.-]{1,63}$')
);

create trigger set_auth_rate_limits_updated_at
before update on public.auth_rate_limits
for each row execute function public.set_updated_at();

-- 所有 M1 业务表启用 RLS。默认没有插入、更新、删除策略。
alter table public.account_credentials enable row level security;
alter table public.profiles enable row level security;
alter table public.point_ledger enable row level security;
alter table public.account_recovery_codes enable row level security;
alter table public.account_recovery_resets enable row level security;
alter table public.account_registration_requests enable row level security;
alter table public.auth_rate_limits enable row level security;

-- 登录用户仅能读取自身档案和积分流水；账号映射、恢复码和限流状态永不直接暴露。
create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy point_ledger_select_own
on public.point_ledger for select to authenticated
using ((select auth.uid()) = user_id);

-- 内部函数：统一账号标准化及格式校验。
create or replace function public.m1_normalize_account(p_account text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_account, '')));
$$;

create or replace function public.m1_is_valid_account(p_account text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.m1_normalize_account(p_account) ~ '^[a-z0-9_]{4,20}$';
$$;

-- 仅由注册 Edge Function 调用。函数以同一事务初始化映射、档案、欢迎积分、流水和恢复码哈希。
create or replace function public.m1_initialize_account(
  p_user_id uuid,
  p_account text,
  p_request_id uuid,
  p_recovery_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_account text := public.m1_normalize_account(p_account);
  v_login_email text;
  v_welcome_points integer;
  v_existing_user uuid;
begin
  if p_user_id is null or p_request_id is null or not public.m1_is_valid_account(v_account) then
    return public.api_error('invalid_account', p_request_id);
  end if;

  if length(coalesce(p_recovery_code_hash, '')) < 64 then
    return public.api_error('invalid_recovery_hash', p_request_id);
  end if;

  select user_id into v_existing_user
  from public.account_registration_requests
  where request_id = p_request_id;

  if found then
    if v_existing_user = p_user_id then
      return jsonb_build_object('ok', true, 'already_initialized', true, 'user_id', p_user_id);
    end if;
    return public.api_error('request_conflict', p_request_id);
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return public.api_error('auth_user_missing', p_request_id);
  end if;

  v_login_email := v_account || '@accounts.xqx.invalid';
  select (value ->> 'value')::integer into v_welcome_points
  from public.app_config
  where key = 'points.welcome';

  if v_welcome_points is null or v_welcome_points < 0 then
    raise exception 'invalid points.welcome configuration';
  end if;

  insert into public.account_credentials (user_id, account_display, account_normalized, login_email)
  values (p_user_id, trim(p_account), v_account, v_login_email);

  insert into public.profiles (user_id, points_balance, free_diy_available)
  values (p_user_id, v_welcome_points, true);

  insert into public.point_ledger (
    user_id, event_type, delta, idempotency_key, reference_type, metadata
  ) values (
    p_user_id,
    'welcome',
    v_welcome_points,
    'welcome:' || p_user_id::text,
    'registration',
    jsonb_build_object('source', 'm1_initialize_account')
  );

  insert into public.account_recovery_codes (user_id, code_hash)
  values (p_user_id, p_recovery_code_hash);

  insert into public.account_registration_requests (request_id, user_id, account_normalized)
  values (p_request_id, p_user_id, v_account);

  return jsonb_build_object(
    'ok', true,
    'already_initialized', false,
    'user_id', p_user_id,
    'points_balance', v_welcome_points,
    'free_diy_available', true
  );
exception
  when unique_violation then
    return public.api_error('account_unavailable', p_request_id);
end;
$$;

-- 仅供登录 Function 查找内部登录标识；匿名用户和普通登录用户均无执行权限。
create or replace function public.m1_lookup_login(p_account text)
returns table (user_id uuid, login_email text)
language sql
stable
security definer
set search_path = public
as $$
  select ac.user_id, ac.login_email
  from public.account_credentials ac
  where ac.account_normalized = public.m1_normalize_account(p_account)
  limit 1;
$$;

-- 返回当前恢复码记录给 Service Role Function；哈希永不暴露给浏览器。
create or replace function public.m1_lookup_recovery_code(p_account text)
returns table (recovery_code_id uuid, user_id uuid, code_hash text)
language sql
stable
security definer
set search_path = public
as $$
  select rc.id, rc.user_id, rc.code_hash
  from public.account_credentials ac
  join public.account_recovery_codes rc on rc.user_id = ac.user_id
  where ac.account_normalized = public.m1_normalize_account(p_account)
    and rc.revoked_at is null
    and rc.used_at is null
    and (rc.reserved_until is null or rc.reserved_until < now())
  order by rc.created_at desc
  limit 1;
$$;

-- 恢复码验证在 Edge Function 完成；本函数只对已验证记录加短时保留锁。
create or replace function public.m1_reserve_recovery_reset(p_recovery_code_id uuid)
returns table (reset_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_reset_id uuid := gen_random_uuid();
begin
  delete from public.account_recovery_resets
  where recovery_code_id = p_recovery_code_id
    and completed_at is null
    and expires_at <= now();

  select user_id into v_user_id
  from public.account_recovery_codes
  where id = p_recovery_code_id
    and revoked_at is null
    and used_at is null
    and (reserved_until is null or reserved_until < now())
  for update;

  if not found then
    return;
  end if;

  update public.account_recovery_codes
  set reserved_until = now() + interval '10 minutes'
  where id = p_recovery_code_id;

  insert into public.account_recovery_resets (id, user_id, recovery_code_id, expires_at)
  values (v_reset_id, v_user_id, p_recovery_code_id, now() + interval '10 minutes');

  return query select v_reset_id, v_user_id;
end;
$$;

-- Auth 密码更新成功后由 Function 调用：消费旧恢复码并原子插入新哈希。
create or replace function public.m1_complete_recovery_reset(
  p_reset_id uuid,
  p_new_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_code_id uuid;
begin
  if length(coalesce(p_new_code_hash, '')) < 64 then
    return false;
  end if;

  select user_id, recovery_code_id into v_user_id, v_code_id
  from public.account_recovery_resets
  where id = p_reset_id
    and completed_at is null
    and expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  update public.account_recovery_codes
  set used_at = now(), revoked_at = now(), reserved_until = null
  where id = v_code_id
    and used_at is null
    and revoked_at is null;

  if not found then
    return false;
  end if;

  insert into public.account_recovery_codes (user_id, code_hash)
  values (v_user_id, p_new_code_hash);

  update public.account_recovery_resets
  set completed_at = now()
  where id = p_reset_id;

  return true;
end;
$$;

-- 数据库持久化限流。调用方只能得到是否允许和建议重试秒数。
create or replace function public.m1_consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.auth_rate_limits;
  v_allowed boolean;
  v_retry_after integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(coalesce(p_subject_hash, '')) < 32 then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.auth_rate_limits (scope, subject_hash, window_started_at, attempts)
  values (p_scope, p_subject_hash, now(), 1)
  on conflict (scope, subject_hash) do update
  set window_started_at = case
        when public.auth_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
        then now()
        else public.auth_rate_limits.window_started_at
      end,
      attempts = case
        when public.auth_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
        then 1
        else public.auth_rate_limits.attempts + 1
      end,
      blocked_until = case
        when public.auth_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
        then null
        when public.auth_rate_limits.attempts + 1 > p_limit
        then now() + make_interval(secs => p_window_seconds)
        else public.auth_rate_limits.blocked_until
      end
  returning * into v_row;

  v_allowed := v_row.blocked_until is null and v_row.attempts <= p_limit;
  v_retry_after := case
    when v_allowed then 0
    else greatest(1, ceil(extract(epoch from (v_row.blocked_until - now())))::integer)
  end;

  return jsonb_build_object('allowed', v_allowed, 'retry_after_seconds', v_retry_after);
end;
$$;

revoke all on table public.account_credentials from anon, authenticated;
revoke all on table public.account_recovery_codes from anon, authenticated;
revoke all on table public.account_recovery_resets from anon, authenticated;
revoke all on table public.account_registration_requests from anon, authenticated;
revoke all on table public.auth_rate_limits from anon, authenticated;
revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.point_ledger from anon, authenticated;

revoke all on function public.m1_normalize_account(text) from public, anon, authenticated;
revoke all on function public.m1_is_valid_account(text) from public, anon, authenticated;
revoke all on function public.m1_initialize_account(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.m1_lookup_login(text) from public, anon, authenticated;
revoke all on function public.m1_lookup_recovery_code(text) from public, anon, authenticated;
revoke all on function public.m1_reserve_recovery_reset(uuid) from public, anon, authenticated;
revoke all on function public.m1_complete_recovery_reset(uuid, text) from public, anon, authenticated;
revoke all on function public.m1_consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;

grant select on table public.profiles, public.point_ledger to authenticated;
grant execute on function public.m1_initialize_account(uuid, text, uuid, text) to service_role;
grant execute on function public.m1_lookup_login(text) to service_role;
grant execute on function public.m1_lookup_recovery_code(text) to service_role;
grant execute on function public.m1_reserve_recovery_reset(uuid) to service_role;
grant execute on function public.m1_complete_recovery_reset(uuid, text) to service_role;
grant execute on function public.m1_consume_rate_limit(text, text, integer, integer) to service_role;

commit;
