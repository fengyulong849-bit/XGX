import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const text = (file) => readFileSync(resolve(root, file), 'utf8');
const fail = (message) => { throw new Error(`后端契约检查失败：${message}`); };

const migrationDir = resolve(root, 'supabase/migrations');
const legacySingleStatementMigrations = new Set(['202608210020_m3_lock_normal_appearance.sql']);
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
if (migrations.length === 0) fail('未找到数据库迁移');
for (const name of migrations) {
  const source = readFileSync(resolve(migrationDir, name), 'utf8').toLowerCase();
  if (!legacySingleStatementMigrations.has(name) && (!/^\s*begin;\s*$/m.test(source) || !/^\s*commit;\s*$/m.test(source))) {
    fail(`${name} 缺少 begin/commit 事务边界`);
  }
}

const functionDir = resolve(root, 'supabase/functions');
const requiredFunctions = [
  'account-delete', 'auth-change-password', 'auth-login', 'auth-register', 'auth-reset-password',
  'care-complete', 'checkin-sign', 'pet-action', 'pet-get', 'pet-revive', 'points-ledger',
  'profile-me', 'profile-save-appearance', 'rant-report', 'rants-create', 'rants-expire',
  'rants-mine', 'rants-random', 'release-complete', 'resonance-claim', 'resonance-create',
  'moderation-history', 'moderation-queue', 'moderation-review',
  'work-preferences-save'
];
for (const name of requiredFunctions) {
  const entry = resolve(functionDir, name, 'index.ts');
  if (!existsSync(entry) || !statSync(entry).isFile()) fail(`缺少 Function 入口：${name}`);
  if (!readFileSync(entry, 'utf8').includes('Deno.serve')) fail(`Function 未注册服务：${name}`);
}

for (const name of ['moderation-queue', 'moderation-review', 'moderation-history']) {
  const source = readFileSync(resolve(functionDir, name, 'index.ts'), 'utf8');
  if (!source.includes('consumeRateLimit')) fail(`审核 Function 未接入服务端限流：${name}`);
}

const authClient = text('scripts/xqx-auth.js');
const personalPage = text('P4_个人中心.html');
if (!authClient.includes('callAuthenticated("account-delete"')) fail('浏览器适配层未调用 account-delete');
if (!personalPage.includes('XQXAuth.deleteAccount') || !personalPage.includes('id="delete-password"')) {
  fail('P4 注销确认未接入密码二次验证');
}

const expirationMigration = text('supabase/migrations/202608210023_m7_expire_rants_purge.sql').toLowerCase();
if (!expirationMigration.includes('delete from public.rants') || !expirationMigration.includes('expires_at <= now()')) {
  fail('到期吐槽迁移未执行物理清理');
}

const moderationMigration = text('supabase/migrations/202608210024_m8_moderation_workflow.sql').toLowerCase();
for (const requiredMarker of ['create table if not exists public.user_roles', 'create table if not exists public.rant_moderation_actions', 'revoke all on table public.user_roles', 'm8_moderation_queue', 'm8_review_rant']) {
  if (!moderationMigration.includes(requiredMarker)) fail(`审核迁移缺少安全标记：${requiredMarker}`);
}

const moderationHistoryMigration = text('supabase/migrations/202608210025_m8_moderation_history.sql').toLowerCase();
for (const requiredMarker of ['m8_moderation_history', 'revoke all on function public.m8_moderation_history', 'grant execute on function public.m8_moderation_history(uuid, integer) to service_role']) {
  if (!moderationHistoryMigration.includes(requiredMarker)) fail(`审核历史迁移缺少安全标记：${requiredMarker}`);
}

console.log(`后端契约检查通过：${migrations.length} 个迁移、${requiredFunctions.length} 个关键 Functions、注销/到期清理/审核链路均完整。`);
