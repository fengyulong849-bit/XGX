-- 修正 M1 恢复码重置保留函数中的 PL/pgSQL 字段歧义。
-- 不改变既有用户、恢复码或积分数据；仅替换函数定义。

begin;

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
  delete from public.account_recovery_resets arr
  where arr.recovery_code_id = p_recovery_code_id
    and arr.completed_at is null
    and arr.expires_at <= now();

  -- `user_id` 也是 returns table 的输出变量，必须使用表别名避免歧义。
  select rc.user_id into v_user_id
  from public.account_recovery_codes rc
  where rc.id = p_recovery_code_id
    and rc.revoked_at is null
    and rc.used_at is null
    and (rc.reserved_until is null or rc.reserved_until < now())
  for update;

  if not found then
    return;
  end if;

  update public.account_recovery_codes rc
  set reserved_until = now() + interval '10 minutes'
  where rc.id = p_recovery_code_id;

  insert into public.account_recovery_resets (id, user_id, recovery_code_id, expires_at)
  values (v_reset_id, v_user_id, p_recovery_code_id, now() + interval '10 minutes');

  return query select v_reset_id, v_user_id;
end;
$$;

revoke all on function public.m1_reserve_recovery_reset(uuid) from public, anon, authenticated;
grant execute on function public.m1_reserve_recovery_reset(uuid) to service_role;

commit;
