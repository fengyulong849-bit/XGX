-- M6：将工作节奏偏好同步至账号，换设备后仍使用同一套下班与提醒设置。
begin;

alter table public.profiles
  add column if not exists water_interval smallint not null default 60 check (water_interval in (30, 45, 60, 90)),
  add column if not exists sit_interval smallint not null default 45 check (sit_interval in (30, 45, 60, 90));

-- 直接更新 profiles 只开放给 Service Role 的 Edge Function；浏览器始终无表写权限。
commit;
