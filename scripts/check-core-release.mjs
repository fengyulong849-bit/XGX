import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(`核心发布检查失败：${message}`); };
const deploySource = readFileSync(resolve(root, 'scripts/deploy-core.mjs'), 'utf8');
const authSource = readFileSync(resolve(root, 'scripts/xqx-auth.js'), 'utf8');
const coreFunctions = [
  'auth-register', 'auth-login', 'auth-reset-password', 'auth-change-password',
  'profile-me', 'profile-save-appearance', 'checkin-sign', 'pet-action', 'pet-get',
  'pet-revive', 'rants-random', 'rants-create', 'rants-mine', 'resonance-create',
  'resonance-claim', 'points-ledger', 'rant-report', 'release-complete', 'release-draft',
  'care-complete', 'work-preferences-save', 'account-delete', 'rants-expire',
];
const browserFunctions = coreFunctions.filter((name) => name !== 'rants-expire');
const deferredFunctions = ['moderation-queue', 'moderation-review', 'moderation-history', 'moderation-role'];

if (!deploySource.includes('const coreFunctions = [')) fail('一键部署脚本缺少核心 Function 清单');
for (const name of coreFunctions) {
  if (!deploySource.includes(`'${name}'`)) fail(`核心部署清单缺少 ${name}`);
  if (!existsSync(resolve(root, 'supabase/functions', name, 'index.ts'))) fail(`缺少核心 Function 文件：${name}`);
  if (browserFunctions.includes(name) && !authSource.includes(`"${name}"`)) fail(`前端认证适配层未引用 ${name}`);
}
for (const name of deferredFunctions) {
  if (deploySource.includes(`'${name}'`)) fail(`M8 Function 不得进入核心部署：${name}`);
}
const rateLimitedCoreFunctions = [
  'auth-change-password', 'checkin-sign', 'work-preferences-save',
  'pet-action', 'pet-revive', 'rants-create', 'resonance-create',
  'resonance-claim', 'rant-report', 'release-complete', 'release-draft',
  'care-complete',
];
for (const name of rateLimitedCoreFunctions) {
  const source = readFileSync(resolve(root, 'supabase/functions', name, 'index.ts'), 'utf8');
  if (!source.includes('consumeRateLimit')) fail(`核心安全接口未接入服务端限流：${name}`);
}

const coreMigrations = ['202608170001_m0_extensions_types_and_security.sql', '202608170002_m1_auth_and_profile_schema.sql'];
for (const name of coreMigrations) {
  if (!existsSync(resolve(root, 'supabase/migrations', name))) fail(`缺少核心迁移：${name}`);
}

console.log(`核心发布检查通过：${coreFunctions.length} 个核心 Function（${browserFunctions.length} 个浏览器调用、1 个后台任务）、${deferredFunctions.length} 个暂缓 M8 Function 边界清晰。`);
