import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = resolve(process.cwd(), 'scripts/xqx-config.js');
const source = readFileSync(configPath, 'utf8');
const url = process.env.XQX_SUPABASE_URL || source.match(/supabaseUrl:\s*["']([^"']+)["']/)?.[1] || '';
const anonKey = process.env.XQX_SUPABASE_ANON_KEY || source.match(/supabaseAnonKey:\s*["']([^"']+)["']/)?.[1] || '';
if (!url || !anonKey) {
  console.error('核心云端冒烟检查未执行：未找到公开 Supabase URL/anon key。');
  console.error('请在 Codespaces 配置 scripts/xqx-config.js，或临时设置 XQX_SUPABASE_URL 与 XQX_SUPABASE_ANON_KEY。');
  process.exitCode = 2;
} else {
  const baseEndpoint = `${url.replace(/\/$/, '')}/functions/v1/rants-random`;
  const requests = await Promise.all([
    fetch(`${baseEndpoint}?limit=1`, { headers: { apikey: anonKey } }),
    fetch(`${baseEndpoint}?limit=abc`, { headers: { apikey: anonKey } }),
  ]);
  const payloads = await Promise.all(requests.map((response) => response.json().catch(() => null)));
  for (const [response, data] of requests.map((response, index) => [response, payloads[index]])) {
    if (!response.ok || !data?.ok || !Array.isArray(data.rants)) {
      throw new Error(`rants-random 返回异常：HTTP ${response.status}`);
    }
  }
  const [response, data] = [requests[0], payloads[0]];
  const forbiddenFields = ['owner_id', 'reporter_id', 'review_status', 'destroyed_at', 'release_rewarded_at'];
  const leaked = data.rants.flatMap((rant) => forbiddenFields.filter((field) => Object.hasOwn(rant, field)));
  if (leaked.length) throw new Error(`公开随机墙返回了禁止字段：${[...new Set(leaked)].join(', ')}`);
  console.log(`核心云端冒烟检查通过：rants-random 正常/非法 limit 均返回 HTTP ${response.status}，返回 ${data.rants.length} 条安全公开内容。`);
}
