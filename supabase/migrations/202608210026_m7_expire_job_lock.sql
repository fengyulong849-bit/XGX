-- M7：过期吐槽清理任务并发保护。重复调度不会并行争抢删除锁。
begin;

create or replace function public.m7_expire_rants()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_expired integer := 0;
begin
  -- 事务结束时自动释放；同一数据库同一时刻只允许一个清理任务继续。
  if not pg_try_advisory_xact_lock(741926026::bigint) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'job_already_running', 'expired_count', 0);
  end if;

  delete from public.rants
  where expires_at <= now()
    and status in ('published', 'expired');
  get diagnostics v_expired = row_count;
  return jsonb_build_object('ok', true, 'skipped', false, 'expired_count', v_expired);
end;
$$;

revoke all on function public.m7_expire_rants() from public, anon, authenticated;
grant execute on function public.m7_expire_rants() to service_role;
commit;
