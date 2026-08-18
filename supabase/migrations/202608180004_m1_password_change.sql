-- M1：登录态修改密码后轮换恢复码。
begin;

create or replace function public.m1_rotate_recovery_after_password_change(
  p_user_id uuid,
  p_new_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or length(coalesce(p_new_code_hash, '')) < 64 then
    return false;
  end if;

  update public.account_recovery_codes rc
  set used_at = now(), revoked_at = now(), reserved_until = null
  where rc.user_id = p_user_id
    and rc.used_at is null
    and rc.revoked_at is null;

  if not found then
    return false;
  end if;

  insert into public.account_recovery_codes (user_id, code_hash)
  values (p_user_id, p_new_code_hash);
  return true;
end;
$$;

revoke all on function public.m1_rotate_recovery_after_password_change(uuid, text) from public, anon, authenticated;
grant execute on function public.m1_rotate_recovery_after_password_change(uuid, text) to service_role;

commit;
