-- M4 修正：每日吐槽上限统一按 Asia/Shanghai 业务日计算。
begin;

create or replace function public.m4_create_rant(p_user_id uuid, p_content text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rant public.rants%rowtype; v_previous jsonb; v_points integer; v_delta integer; v_limit integer;
  v_key text := 'rant_publish:' || p_request_id::text; v_content text := regexp_replace(trim(coalesce(p_content, '')), '\s+', ' ', 'g');
begin
  if p_user_id is null or p_request_id is null or length(v_content) < 1 or length(v_content) > 50 then return jsonb_build_object('ok',false,'reason','invalid_content'); end if;
  select metadata,delta into v_previous,v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  if found then select points_balance into v_points from public.profiles where user_id=p_user_id; return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_points,'rant',v_previous->'rant'); end if;
  select coalesce((value->>'value')::integer,3) into v_limit from public.app_config where key='limits.rants_per_day';
  if (select count(*) from public.rants where owner_id=p_user_id and created_at >= (public.business_date()::timestamp at time zone 'Asia/Shanghai')) >= coalesce(v_limit,3) then return jsonb_build_object('ok',false,'reason','limit_exceeded'); end if;
  select coalesce((value->>'value')::integer,50) into v_delta from public.app_config where key='points.rant_publish'; v_delta:=coalesce(v_delta,50);
  insert into public.rants(owner_id,content) values(p_user_id,v_content) returning * into v_rant;
  insert into public.point_ledger(user_id,event_type,delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'rant_publish',v_delta,v_key,'rant',v_rant.id,jsonb_build_object('rant',jsonb_build_object('id',v_rant.id,'content',v_rant.content,'votes',0,'created_at',v_rant.created_at,'expires_at',v_rant.expires_at)));
  update public.profiles set points_balance=points_balance+v_delta where user_id=p_user_id returning points_balance into v_points;
  return jsonb_build_object('ok',true,'replayed',false,'points_delta',v_delta,'points_balance',v_points,'remaining_today',coalesce(v_limit,3)-1,'rant',jsonb_build_object('id',v_rant.id,'content',v_rant.content,'votes',v_rant.votes,'created_at',v_rant.created_at,'expires_at',v_rant.expires_at));
exception when unique_violation then
  select metadata,delta into v_previous,v_delta from public.point_ledger where user_id=p_user_id and idempotency_key=v_key;
  select points_balance into v_points from public.profiles where user_id=p_user_id;
  return jsonb_build_object('ok',true,'replayed',true,'points_delta',v_delta,'points_balance',v_points,'rant',v_previous->'rant');
end; $$;

revoke all on function public.m4_create_rant(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.m4_create_rant(uuid,text,uuid) to service_role;
commit;
