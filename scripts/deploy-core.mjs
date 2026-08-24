import { spawnSync } from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');
const root = process.cwd();
const cli = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const coreFunctions = [
  'auth-register', 'auth-login', 'auth-reset-password', 'auth-change-password',
  'profile-me', 'profile-save-appearance', 'checkin-sign', 'pet-action', 'pet-get',
  'pet-revive', 'rants-random', 'rants-create', 'rants-mine', 'resonance-create',
  'resonance-claim', 'points-ledger', 'rant-report', 'release-complete', 'release-draft',
  'care-complete', 'work-preferences-save', 'account-delete', 'rants-expire',
];

const run = (label, command, args) => {
  console.log(`\n==> ${label}`);
  if (dryRun) { console.log([command, ...args].join(' ')); return; }
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} 失败（退出码 ${result.status ?? 'unknown'}）`);
};

try {
  run('检查项目契约', process.execPath, ['scripts/check-static.mjs']);
  run('检查后端契约', process.execPath, ['scripts/check-backend.mjs']);
  run('部署数据库迁移', cli, ['--yes', 'supabase@latest', 'db', 'push']);
  for (const functionName of coreFunctions) {
    run(`部署核心 Function：${functionName}`, cli, ['--yes', 'supabase@latest', 'functions', 'deploy', functionName]);
  }
  console.log(dryRun ? '\n模拟完成：未连接 Supabase，也未修改云端。' : `\nM1-M7 核心部署完成：迁移和 ${coreFunctions.length} 个核心 Function 已执行。`);
} catch (error) {
  console.error(`\n核心部署未完成：${error instanceof Error ? error.message : String(error)}`);
  console.error('如提示缺少 Access Token，请先执行：npm run supabase -- login');
  process.exitCode = 1;
}
