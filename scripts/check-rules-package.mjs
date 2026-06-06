import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

const errors = [];
const warnings = [];

const RULES_FIELDS = [
  'overtempThreshold',
  'missingLogIntervalMin',
  'overtempDurationDangerMin',
  'overtempDeltaDanger',
  'missingLogGapDangerMin',
];

const AUDIT_ACTIONS = ['export_rules_package', 'import_rules_package'];

const typesContent = read('src/types/index.ts');

console.log('[check-rules-package] 检查 1：类型定义完整性');

for (const field of RULES_FIELDS) {
  if (!typesContent.includes(field)) {
    errors.push(`src/types/index.ts 中缺少规则字段 ${field}`);
  }
}

if (!typesContent.includes('RULES_PACKAGE_VERSION')) {
  errors.push('src/types/index.ts 缺少 RULES_PACKAGE_VERSION 常量');
}

if (!typesContent.includes('REVIEW_RULES_RANGES')) {
  errors.push('src/types/index.ts 缺少 REVIEW_RULES_RANGES 范围定义');
} else {
  for (const field of RULES_FIELDS) {
    if (!typesContent.match(new RegExp(field + ':\\s*\\{\\s*min:'))) {
      errors.push(`REVIEW_RULES_RANGES 中缺少字段 ${field} 的范围定义`);
    }
  }
}

if (!typesContent.includes('RulesPackage')) {
  errors.push('src/types/index.ts 缺少 RulesPackage 接口');
}
if (!typesContent.includes('RuleValidationIssue')) {
  errors.push('src/types/index.ts 缺少 RuleValidationIssue 接口');
}
if (!typesContent.includes('RulesPackagePreviewState')) {
  errors.push('src/types/index.ts 缺少 RulesPackagePreviewState 接口');
}
for (const action of AUDIT_ACTIONS) {
  if (!typesContent.includes(action)) {
    errors.push(`AuditAction 类型中缺少 '${action}'`);
  }
}

console.log('[check-rules-package] 检查 2：Store actions 与持久化');

const storeContent = read('src/store/index.ts');

const REQUIRED_ACTIONS = [
  'exportRulesPackage',
  'previewRulesPackage',
  'applyRulesPackage',
  'clearRulesPackagePreview',
];

for (const action of REQUIRED_ACTIONS) {
  if (!storeContent.includes(`${action}:`)) {
    errors.push(`src/store/index.ts 中缺少 ${action} action`);
  }
}

if (!storeContent.includes('rulesPackagePreview:')) {
  errors.push('src/store/index.ts 中缺少 rulesPackagePreview 状态');
}

if (!storeContent.match(/rulesPackagePreview:\s*state\.rulesPackagePreview/)) {
  errors.push(
    'zustand persist 的 partialize 中未包含 rulesPackagePreview（预览状态刷新后会丢失）',
  );
}

if (!storeContent.includes("from '@/services/rulesPackage'")) {
  errors.push('src/store/index.ts 未从 rulesPackage 服务模块导入功能');
}

if (!storeContent.includes("detectAnomalies()") || !storeContent.includes('applyRulesPackage')) {
  warnings.push('需要确认：applyRulesPackage 成功后是否调用了 detectAnomalies() 重新计算异常');
} else {
  const applyStart = storeContent.indexOf('applyRulesPackage:');
  if (applyStart >= 0) {
    const applySlice = storeContent.slice(applyStart, applyStart + 1500);
    if (!applySlice.includes('detectAnomalies')) {
      errors.push('applyRulesPackage 内未调用 detectAnomalies()，导入后异常不会自动刷新');
    }
    if (!applySlice.includes("'import_rules_package'")) {
      errors.push("applyRulesPackage 审计日志 action 应为 'import_rules_package'");
    }
    if (!applySlice.includes('before') || !applySlice.includes('after')) {
      errors.push('applyRulesPackage 审计日志 metadata 未包含变更前后规则快照 (before/after)');
    }
  }
}

if (!storeContent.includes("'export_rules_package'")) {
  errors.push("exportRulesPackage 审计日志 action 应为 'export_rules_package'");
}

console.log('[check-rules-package] 检查 3：异常导出 JSON 规则快照');

const csvServiceContent = read('src/services/csvService.ts');

if (!csvServiceContent.includes('reviewRules')) {
  errors.push('csvService buildExportJson 未包含 reviewRules 参数（异常导出 JSON 缺少规则快照）');
}

const buildJsonIdx = csvServiceContent.indexOf('buildExportJson');
if (buildJsonIdx >= 0) {
  const buildJsonSlice = csvServiceContent.slice(buildJsonIdx, buildJsonIdx + 800);
  if (!buildJsonSlice.includes('reviewRules:') && !buildJsonSlice.includes('reviewRules ??')) {
    errors.push('buildExportJson 返回的 JSON 根对象缺少 reviewRules 字段');
  }
}

console.log('[check-rules-package] 检查 4：审计面板与动作标签');

const anomalyEngineContent = read('src/services/anomalyEngine.ts');
for (const action of AUDIT_ACTIONS) {
  if (!anomalyEngineContent.includes(`${action}:`)) {
    errors.push(`AUDIT_ACTION_LABEL 中缺少 '${action}' 的中文标签`);
  }
}

const auditPanelContent = read('src/components/AuditLogPanel.tsx');
for (const action of AUDIT_ACTIONS) {
  if (!auditPanelContent.includes(`'${action}'`) && !auditPanelContent.includes(`${action}:`)) {
    errors.push(`AuditLogPanel ALL_ACTIONS / ACTION_COLOR 中缺少 '${action}'`);
  }
}

console.log('[check-rules-package] 检查 5：RulesPanel 导出/导入按钮');

const rulesPanelContent = read('src/components/RulesPanel.tsx');
if (!rulesPanelContent.includes('导出规则包')) {
  errors.push('RulesPanel 缺少「导出规则包」按钮');
}
if (!rulesPanelContent.includes('导入规则包')) {
  errors.push('RulesPanel 缺少「导入规则包」按钮');
}
if (!rulesPanelContent.includes('RulesPackagePreviewModal')) {
  errors.push('RulesPanel 未包含 RulesPackagePreviewModal 预览弹窗');
}

console.log('[check-rules-package] 检查 6：rulesPackage 服务模块存在性');

try {
  const svc = read('src/services/rulesPackage.ts');
  if (!svc.includes('validateRulesFields')) {
    errors.push('rulesPackage.ts 缺少 validateRulesFields 校验函数（防缺字段/非数字/超范围回退）');
  }
  if (!svc.includes('validateRulesPackageVersion')) {
    errors.push('rulesPackage.ts 缺少 validateRulesPackageVersion 版本兼容校验');
  }
  if (!svc.includes('computeRuleDiffs')) {
    errors.push('rulesPackage.ts 缺少 computeRuleDiffs 差异计算');
  }
  if (!svc.includes('exportRulesPackageFile')) {
    errors.push('rulesPackage.ts 缺少 exportRulesPackageFile 导出函数');
  }
  if (!svc.includes('previewRulesPackage')) {
    errors.push('rulesPackage.ts 缺少 previewRulesPackage 预览函数');
  }
  if (!svc.includes('missing_field') || !svc.includes('non_numeric') || !svc.includes('out_of_range')) {
    errors.push('rulesPackage.ts 未覆盖全部校验类型：missing_field / non_numeric / out_of_range');
  }
} catch {
  errors.push('src/services/rulesPackage.ts 文件不存在');
}

console.log('[check-rules-package] 检查 7：文档同步（README + HelpDrawer）');

const readmeContent = read('README.md');
if (!readmeContent.includes('规则配置包')) {
  errors.push('README.md 未包含「规则配置包」使用说明');
}

const helpContent = read('src/components/HelpDrawer.tsx');
if (!helpContent.includes('规则配置包使用说明')) {
  errors.push('HelpDrawer 未包含「规则配置包使用说明」章节');
}

if (warnings.length > 0) {
  console.warn('[check-rules-package] ⚠️  以下检查需人工确认：');
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length > 0) {
  console.error('[check-rules-package] ❌ 以下检查未通过：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  '[check-rules-package] ✅ 所有检查通过：类型 / Store 持久化 / 异常导出快照 / 审计标签 / RulesPanel UI / 校验服务 / 文档 均已正确配置',
);
