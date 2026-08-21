-- M7：到期匿名发声不只隐藏，按产品规则物理删除正文及其关联记录。
begin;

create or replace function public.m7_expire_rants()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_expired integer := 0;
begin
  -- 兼容旧版本已标记为 expired 的行，并清理仍处于 published 但已超时的行。
  -- rants 删除会由外键级联删除 resonances 与 rant_reports，不保留可关联内容。
  delete from public.rants
  where expires_at <= now()
    and status in ('published', 'expired');
  get diagnostics v_expired = row_count;
  return jsonb_build_object('ok', true, 'expired_count', v_expired);
end;
$$;

revoke all on function public.m7_expire_rants() from public, anon, authenticated;
grant execute on function public.m7_expire_rants() to service_role;
commit;
