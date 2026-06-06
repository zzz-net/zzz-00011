import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

const typesContent = read('src/types/index.ts');
const keyMatch = typesContent.match(/export\s+const\s+PERSIST_STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
if (!keyMatch) {
  console.error('[check-persist-key] ❌ 未在 src/types/index.ts 中找到 PERSIST_STORAGE_KEY 常量导出');
  process.exit(1);
}
const expectedKey = keyMatch[1];
console.log(`[check-persist-key] 代码常量 PERSIST_STORAGE_KEY = "${expectedKey}"`);

const errors = [];

const readmeContent = read('README.md');
const readmeKeys = [...readmeContent.matchAll(/cold-chain-dashboard-v\d+/g)].map((m) => m[0]);
if (!readmeKeys.includes(expectedKey)) {
  errors.push(`README.md 中未找到当前 key "${expectedKey}"，实际出现：${readmeKeys.join(', ') || '(无)'}`);
}
const allowedLegacy = new Set([expectedKey, 'cold-chain-dashboard-v1']);
for (const k of readmeKeys) {
  if (!allowedLegacy.has(k)) {
    errors.push(`README.md 出现未知 key "${k}"，只允许 "${expectedKey}" 和历史 "cold-chain-dashboard-v1"`);
  }
}

const helpContent = read('src/components/HelpDrawer.tsx');
if (!helpContent.includes(expectedKey)) {
  errors.push(`src/components/HelpDrawer.tsx 持久化说明未包含当前 key "${expectedKey}"`);
}

const storeContent = read('src/store/index.ts');
if (!/import\s*\{[^}]*PERSIST_STORAGE_KEY[^}]*\}\s*from\s*['"]@\/types['"]/.test(storeContent)) {
  errors.push('src/store/index.ts 未从 @/types 导入 PERSIST_STORAGE_KEY 常量');
}
if (!/name:\s*PERSIST_STORAGE_KEY/.test(storeContent)) {
  errors.push('src/store/index.ts 的 persist 配置未使用 PERSIST_STORAGE_KEY 常量（可能硬编码了字符串）');
}
if (/name:\s*['"]cold-chain-dashboard-v\d+['"]/.test(storeContent)) {
  errors.push('src/store/index.ts 的 persist 配置仍在硬编码 localStorage key，应改用 PERSIST_STORAGE_KEY 常量');
}

if (errors.length > 0) {
  console.error('[check-persist-key] ❌ 以下检查未通过：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[check-persist-key] ✅ 所有检查通过：README / HelpDrawer / store 均与代码常量一致');
