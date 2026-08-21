-- M8：审核员只读处理历史。对浏览器继续隐藏人员身份和内部备注。
begin;

create or replace function public.m8_moderation_history(p_moderator_id uuid, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
begin
  if not public.m8_is_moderator(p_moderator_id) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'rant_id', action.rant_id,
      'content', rant.content,
      'decision', action.decision,
      'review_status', action.resulting_review_status,
      'created_at', action.created_at
    ) as item
    from public.rant_moderation_actions action
    join public.rants rant on rant.id = action.rant_id
    order by action.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ) history;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.m8_moderation_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.m8_moderation_history(uuid, integer) to service_role;
commit;
