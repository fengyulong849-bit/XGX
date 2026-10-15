import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The DIY logic lives inside HTML, so node --check on standalone JS misses it.
const html = readFileSync(new URL('../P2_捏脸DIY.html', import.meta.url), 'utf8');
let count = 0;
for (const [, attributes, source] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (attributes.includes('importmap') || !source.trim()) continue;
  execFileSync(process.execPath, ['--check', `--input-type=${attributes.includes('module') ? 'module' : 'commonjs'}`], { input: source });
  count++;
}
if (count !== 2) throw new Error('DIY inline scripts missing; check the HTML structure.');
console.log(`DIY 内联脚本语法检查通过：${count} 个脚本。`);
