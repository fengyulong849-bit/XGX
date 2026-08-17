import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'P1_首页.html',
  'P2_捏脸DIY.html',
  'P3_释怀仪式.html',
  'P4_个人中心.html',
  'P5_找回密码.html',
  'P6_规则与隐私.html',
  'supabase/migrations/202608170001_m0_extensions_types_and_security.sql',
  '文档/小确闲_后端开发文档.md'
];

const missing = requiredFiles.filter((file) => !existsSync(resolve(root, file)));
if (missing.length > 0) {
  throw new Error(`缺少项目基线文件：${missing.join(', ')}`);
}

const migrationPath = resolve(root, 'supabase/migrations/202608170001_m0_extensions_types_and_security.sql');
const migration = readFileSync(migrationPath, 'utf8');
for (const marker of ['begin;', 'commit;', 'enable row level security', 'revoke all']) {
  if (!migration.toLowerCase().includes(marker)) {
    throw new Error(`M0 迁移缺少安全标记：${marker}`);
  }
}

const forbidden = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s#]/,
  /RECOVERY_CODE_PEPPER\s*=\s*[^\s#]/,
  /RATE_LIMIT_SECRET\s*=\s*[^\s#]/
];

const scannedFiles = [
  'package.json',
  '.devcontainer/devcontainer.json',
  'supabase/migrations/202608170001_m0_extensions_types_and_security.sql'
];
for (const file of scannedFiles) {
  const content = readFileSync(resolve(root, file), 'utf8');
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`检测到疑似明文敏感配置：${file}`);
  }
}

console.log(`静态基线检查通过：${requiredFiles.length} 个必需文件、M0 安全标记和敏感配置检查均正常。`);
