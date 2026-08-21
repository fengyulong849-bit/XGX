-- M5：允许无奖励的正常释怀，并支持不公开到吐槽墙的手写释怀草稿。
begin;

alter table public.point_ledger drop constraint if exists point_ledger_delta_check;
alter table public.point_ledger add constraint point_ledger_delta_check
  check (delta <> 0 or event_type = 'release_complete');

create or replace function public.m5_release_draft(p_user_id uuid, p_content text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_content text := regexp_replace(trim(coalesce(p_content, '')), '\s+', ' ', 'g');
  v_key text := 'release_draft:' || p_request_id::text; v_rant_id uuid; v_balance integer;
begin
  if p_user_id is null or p_request_id is null or length(v_content) not between 1 and 50 then return jsonb_build_object('ok',false,'reason','invalid_content'); end if;
  if exists(select 1 from public.point_ledger where user_id=p_user_id and idempotency_key=v_key) then
    select points_balance into v_balance from public.profiles where user_id=p_user_id;
    return jsonb_build_object('ok',true,'replayed',true,'points_delta',0,'points_balance',v_balance,'eligible',false,'is_draft',true);
  end if;
  insert into public.rants(owner_id,content,status,review_status,destroyed_at)
    values(p_user_id,v_content,'destroyed','hidden',now()) returning id into v_rant_id;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata)
    values(p_user_id,'release_complete',0,v_key,'rant',v_rant_id,jsonb_build_object('eligible',false,'is_draft',true));
  select points_balance into v_balance from public.profiles where user_id=p_user_id;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',0,'points_balance',v_balance,'eligible',false,'is_draft',true,'rant_id',v_rant_id);
end; $$;

revoke all on function public.m5_release_draft(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.m5_release_draft(uuid,text,uuid) to service_role;
commit;
