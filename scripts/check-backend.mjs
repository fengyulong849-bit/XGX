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
  'work-preferences-save'
];
for (const name of requiredFunctions) {
  const entry = resolve(functionDir, name, 'index.ts');
  if (!existsSync(entry) || !statSync(entry).isFile()) fail(`缺少 Function 入口：${name}`);
  if (!readFileSync(entry, 'utf8').includes('Deno.serve')) fail(`Function 未注册服务：${name}`);
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

console.log(`后端契约检查通过：${migrations.length} 个迁移、${requiredFunctions.length} 个关键 Functions、注销与到期清理链路均完整。`);
