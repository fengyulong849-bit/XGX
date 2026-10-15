import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The DIY logic lives inside HTML, so node --check on standalone JS misses it.
for (const page of ['P1_首页.html', 'P2_捏脸DIY.html']) {
const html = readFileSync(new URL('../'+page, import.meta.url), 'utf8');
let count = 0;
for (const [, attributes, source] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (attributes.includes('importmap') || !source.trim()) continue;
  execFileSync(process.execPath, ['--check', `--input-type=${attributes.includes('module') ? 'module' : 'commonjs'}`], { input: source });
  count++;
}
if (count < 2) throw new Error(page+': inline scripts missing.');
if (!html.includes("import { buildCharacter } from './scripts/xqx-character.js'")) throw new Error(page+': shared character import missing.');
console.log(`${page} 内联脚本语法检查通过：${count} 个脚本。`);

}
execFileSync(process.execPath, ['--check', '--input-type=module'], { input: readFileSync(new URL('./xqx-character.js', import.meta.url), 'utf8') });
