import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

const errors = [];
const passes = [];

function check(cond, msg) {
  if (cond) passes.push(msg);
  else errors.push(msg);
}

const storeContent = read('src/store/index.ts');
const typesContent = read('src/types/index.ts');
const panelContent = read('src/components/HandoverPanel.tsx');
const createModalContent = read('src/components/HandoverCreateModal.tsx');
const processModalContent = read('src/components/HandoverProcessModal.tsx');
const csvContent = read('src/services/csvService.ts');
const auditLogContent = read('src/components/AuditLogPanel.tsx');
const anomalyEngine = read('src/services/anomalyEngine.ts');
const homeContent = read('src/pages/Home.tsx');
const headerContent = read('src/components/Header.tsx');
const helpContent = read('src/components/HelpDrawer.tsx');
const readmeContent = read('README.md');

const TYPES_TO_CHECK = [
  'HandoverStatus',
  'HandoverRecord',
  'HandoverItemSnapshot',
  'HandoverLock',
  'HandoverFilterState',
  'create_handover',
  'accept_handover',
  'return_handover',
  'complete_handover',
  'handover_conflict',
];
for (const t of TYPES_TO_CHECK) {
  check(typesContent.includes(t), `类型定义包含 ${t}`);
}

const STORE_METHODS = [
  'createHandover',
  'acceptHandover',
  'returnHandover',
  'completeHandover',
  'acquireItemLock',
  'releaseItemLock',
  'exportHandoverData',
  'setHandoverFilter',
  'handoverRecords:',
  'handoverLocks:',
  'handoverFilter:',
];
for (const m of STORE_METHODS) {
  check(storeContent.includes(m), `store 实现包含 ${m}`);
}

const persistMatch = storeContent.match(/partialize:\s*\(state\)\s*=>\s*\(\{([\s\S]*?)\}\)/);
if (persistMatch) {
  const persistBody = persistMatch[1];
  const persistChecks = [
    ['handoverRecords', '交接记录持久化'],
    ['handoverLocks', '锁定状态持久化'],
    ['handoverFilter', '交接筛选持久化'],
  ];
  for (const [field, desc] of persistChecks) {
    check(persistBody.includes(field), `${desc} (${field})`);
  }
} else {
  errors.push('未找到 persist partialize 配置');
}

const FILTER_FEATURES = [
  ['selTypes', '异常类型筛选'],
  ['selSeverities', '严重级别筛选'],
  ['selStatuses', '复核状态筛选'],
  ['batchSearch', '批次号搜索'],
];
for (const [m, desc] of FILTER_FEATURES) {
  check(createModalContent.includes(m), `交接创建弹窗支持 ${desc}`);
}

const PERMISSION_CHECKS = [
  ["record.receivedBy !== reviewer", '接收操作校验权限'],
  ["h.receivedBy === currentReviewer", '待办队列按接收人过滤'],
  ["h.handedBy === currentReviewer", '我创建的按交接人过滤'],
];
for (const [pattern, desc] of PERMISSION_CHECKS) {
  const foundInStore = storeContent.includes(pattern) || panelContent.includes(pattern);
  check(foundInStore, `权限分流：${desc}`);
}

const CONFLICT_CHECKS = [
  ['acquireItemLock', '锁定获取方法'],
  ['handover_conflict', '冲突审计动作'],
  ['lockedBy === reviewer', '非本人锁冲突判定'],
  ['可能覆盖他人结论', '冲突二次确认提示文案'],
  ['conflictAlerts', 'UI 冲突提示状态'],
];
for (const [m, desc] of CONFLICT_CHECKS) {
  const found =
    storeContent.includes(m) ||
    processModalContent.includes(m) ||
    auditLogContent.includes(m) ||
    anomalyEngine.includes(m);
  check(found, `冲突检测：${desc}`);
}

const EXPORT_CHECKS = [
  ['buildHandoverExportCsv', 'CSV 导出构建函数'],
  ['buildHandoverExportJson', 'JSON 导出构建函数'],
  ['exportHandoverData', '导出动作方法'],
  ['rulesSnapshot', '规则快照导出字段'],
];
for (const [fn, desc] of EXPORT_CHECKS) {
  const found =
    csvContent.includes(fn) || storeContent.includes(fn);
  check(found, `导出功能：${desc}`);
}

const WORKFLOW_STATUS = ['pending', 'accepted', 'returned', 'completed'];
let allStatusesOk = true;
for (const st of WORKFLOW_STATUS) {
  if (!anomalyEngine.includes(`${st}:`)) {
    allStatusesOk = false;
  }
}
check(allStatusesOk, '交接 4 种状态在 anomalyEngine 中都有标签');

const RETURN_FEATURES = [
  ['returnReason', '退回原因字段'],
  ['returnHandover', '退回动作方法'],
  ['handoverLocks.filter', '退回时清除锁'],
];
for (const [f, desc] of RETURN_FEATURES) {
  check(storeContent.includes(f), `退回机制：${desc}`);
}

const RULES_SNAPSHOT = typesContent.includes('rulesSnapshot: ReviewRules');
check(RULES_SNAPSHOT, '交接条目包含规则快照字段');

const AUDIT_NEW_ACTIONS = ['create_handover', 'accept_handover', 'return_handover', 'complete_handover', 'handover_conflict'];
for (const a of AUDIT_NEW_ACTIONS) {
  const hasAudit = auditLogContent.includes(`'${a}'`);
  check(hasAudit, `审计面板包含动作：${a}`);
}

const UI_INTEGRATION_CHECKS = [
  ['HandoverPanel', '首页引入 HandoverPanel'],
  ['HandoverCreateModal', '首页引入 HandoverCreateModal'],
  ['onCreateHandover', 'Header 接收创建交接回调'],
  ['ClipboardList', '创建交接按钮图标'],
];
for (const [token, desc] of UI_INTEGRATION_CHECKS) {
  const found =
    homeContent.includes(token) ||
    headerContent.includes(token);
  check(found, `UI 集成：${desc}`);
}

const DOC_CHECKS = [
  ['复核交接班功能', 'README 交接章节'],
  ['多人同时处理冲突检测', 'README 冲突说明'],
  ['刷新保留', 'README 持久化说明'],
  ['复核交接班功能使用说明', '帮助抽屉交接说明'],
  ['创建交接清单', '帮助抽屉创建步骤'],
];
for (const [token, desc] of DOC_CHECKS) {
  const found = readmeContent.includes(token) || helpContent.includes(token);
  check(found, `文档包含：${desc}`);
}

const csvExportHasRules = csvContent.includes('JSON.stringify(item.rulesSnapshot)');
check(csvExportHasRules, 'CSV 导出包含规则快照 JSON');

const jsonExportHasRecords = csvContent.includes('handoverRecords');
check(jsonExportHasRecords, 'JSON 导出包含 handoverRecords 数组');

const lockAutoClear = storeContent.includes("handoverLocks: st.handoverLocks.filter((l) => l.handoverId !== handoverId)");
check(lockAutoClear, '完成/退回交接时自动清理相关锁');

console.log('\n==============================');
console.log(`交接功能检查结果：通过 ${passes.length}，失败 ${errors.length}`);
console.log('==============================\n');

if (errors.length > 0) {
  console.error('❌ 失败项：');
  for (const e of errors) console.error(`  - ${e}`);
  console.log('');
  process.exit(1);
} else {
  console.log(`✅ 全部 ${passes.length} 项检查通过！`);
}
