-- M7：账号注销在 Edge Function 中完成 JWT 和密码二次确认；Auth 用户删除会级联删除个人数据。
begin;

-- 显式固定跨模块外键的注销语义。吐槽删除会继续级联共鸣和举报记录。
alter table public.rants drop constraint if exists rants_owner_id_fkey;
alter table public.rants add constraint rants_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.resonances drop constraint if exists resonances_actor_id_fkey;
alter table public.resonances add constraint resonances_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete cascade;
alter table public.resonances drop constraint if exists resonances_owner_id_fkey;
alter table public.resonances add constraint resonances_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.rant_reports drop constraint if exists rant_reports_reporter_id_fkey;
alter table public.rant_reports add constraint rant_reports_reporter_id_fkey foreign key (reporter_id) references auth.users(id) on delete cascade;

revoke all on table public.rants, public.resonances, public.rant_reports from anon, authenticated;
commit;
