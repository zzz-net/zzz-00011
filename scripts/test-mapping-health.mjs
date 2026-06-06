// 映射健康检查 + 可追溯导入 核心功能测试脚本
// 覆盖：源列失效检测、新增列检测、必填缺失检测、同源冲突检测、
//       审计日志元数据结构（阻断/导入/变更/导出）、
//       localStorage 持久化（按文件类型隔离、刷新保留、新旧格式兼容）
// 运行：node scripts/test-mapping-health.mjs

import assert from 'node:assert/strict';

// ---------- 从 src/services/csvService.ts 和 src/types/index.ts 提取的实现 ----------

const FIELD_MAPPING_STORAGE_KEY = 'cold-chain-field-mappings-v1';

const FIELD_ALIASES = {
  arrival: {
    batchId: ['batchId', 'batch_id', 'batch id', '批次号', '批次', '批号', 'BatchID', 'Batch Id', 'BATCH_ID'],
    productName: ['productName', 'product_name', 'product name', '产品名称', '品名', '产品', 'Product Name', 'PRODUCT_NAME'],
    arrivalTime: ['arrivalTime', 'arrival_time', 'arrival time', '到货时间', '到达时间', '入库时间', 'Arrival Time', 'ARRIVAL_TIME'],
    requiredTempMin: ['requiredTempMin', 'required_temp_min', 'required temp min', '要求最低温度', '最低温度', '温度下限', 'tempMin', 'temp_min', 'Required Temp Min', 'REQUIRED_TEMP_MIN'],
    requiredTempMax: ['requiredTempMax', 'required_temp_max', 'required temp max', '要求最高温度', '最高温度', '温度上限', 'tempMax', 'temp_max', 'Required Temp Max', 'REQUIRED_TEMP_MAX'],
    supplier: ['supplier', '供应商', '供货商', 'Supplier', 'SUPPLIER'],
    quantity: ['quantity', '数量', 'Qty', 'qty', 'QUANTITY'],
  },
  log: {
    batchId: ['batchId', 'batch_id', 'batch id', '批次号', '批次', '批号', 'BatchID', 'Batch Id', 'BATCH_ID'],
    timestamp: ['timestamp', 'time_stamp', 'time', '记录时间', '时间', '采集时间', 'Time', 'TIME', 'TIMESTAMP'],
    temperature: ['temperature', 'temp', '温度值', '温度', 'Temperature', 'TEMP', 'TEMPERATURE'],
  },
  review: {
    batchId: ['batchId', 'batch_id', 'batch id', '批次号', '批次', '批号', 'BatchID', 'Batch Id', 'BATCH_ID'],
    reviewer: ['reviewer', '复核人', '审核人', 'Reviewer', 'REVIEWER'],
    conclusion: ['conclusion', '复核结论', '结论', '审核结论', 'Conclusion', 'CONCLUSION'],
    remark: ['remark', '备注', '说明', 'Remark', 'REMARK'],
    reviewTime: ['reviewTime', 'review_time', 'review time', '复核时间', '审核时间', 'Review Time', 'REVIEW_TIME'],
  },
};

const FIELD_LABELS = {
  arrival: {
    batchId: '批次号',
    productName: '产品名称',
    arrivalTime: '到货时间',
    requiredTempMin: '要求最低温度',
    requiredTempMax: '要求最高温度',
    supplier: '供应商',
    quantity: '数量',
  },
  log: {
    batchId: '批次号',
    timestamp: '记录时间',
    temperature: '温度值',
  },
  review: {
    batchId: '批次号',
    reviewer: '复核人',
    conclusion: '复核结论',
    remark: '备注',
    reviewTime: '复核时间',
  },
};

const REQUIRED_COLUMNS = {
  arrival: ['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax'],
  log: ['batchId', 'timestamp', 'temperature'],
  review: ['batchId', 'reviewer', 'conclusion'],
};

function normalizeHeader(h) {
  if (!h) return '';
  return String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
}

function autoMatchField(fileType, headers) {
  const aliases = FIELD_ALIASES[fileType];
  const labels = FIELD_LABELS[fileType];
  const requiredColumns = REQUIRED_COLUMNS[fileType];
  const targetFields = Object.keys(aliases);
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

  return targetFields.map((field) => {
    const fieldAliases = aliases[field];
    const normalizedAliases = fieldAliases.map(normalizeHeader);
    let matchedColumn = null;
    let matchReason;

    for (let headerIdx = 0; headerIdx < normalizedHeaders.length; headerIdx++) {
      const { original, normalized } = normalizedHeaders[headerIdx];
      if (normalizedAliases.includes(normalized)) {
        matchedColumn = original;
        matchReason = `别名匹配: "${original}" → ${labels[field] || field}`;
        break;
      }
    }

    if (!matchedColumn) {
      for (let headerIdx = 0; headerIdx < normalizedHeaders.length; headerIdx++) {
        const { original, normalized } = normalizedHeaders[headerIdx];
        const nf = normalizeHeader(field);
        if (normalized.includes(nf) || nf.includes(normalized)) {
          matchedColumn = original;
          matchReason = `模糊匹配: "${original}" → "${field}"`;
          break;
        }
      }
    }

    return {
      targetField: field,
      sourceColumn: matchedColumn,
      isRequired: requiredColumns.includes(field),
      matchedAutomatically: matchedColumn !== null,
      matchReason,
    };
  });
}

// ---------- localStorage 模拟 + 保存/加载 ----------

let mockStorage = {};

function saveFieldMappings(fileType, mappings, headers) {
  try {
    const raw = mockStorage[FIELD_MAPPING_STORAGE_KEY];
    const saved = raw ? JSON.parse(raw) : {};
    const entry = {
      mappings,
      headers,
      savedAt: new Date().toISOString(),
    };
    saved[fileType] = entry;
    saved.updatedAt = new Date().toISOString();
    mockStorage[FIELD_MAPPING_STORAGE_KEY] = JSON.stringify(saved);
    return true;
  } catch {
    return false;
  }
}

function loadFieldMappings() {
  try {
    const raw = mockStorage[FIELD_MAPPING_STORAGE_KEY];
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const normalized = {};
    for (const key of Object.keys(parsed)) {
      if (key === 'updatedAt') {
        normalized.updatedAt = parsed.updatedAt;
        continue;
      }
      const val = parsed[key];
      if (Array.isArray(val)) {
        normalized[key] = {
          mappings: val,
          headers: [],
          savedAt: parsed.updatedAt || new Date().toISOString(),
        };
      } else if (val && typeof val === 'object' && 'mappings' in val) {
        normalized[key] = val;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function getSavedMappingForType(fileType) {
  return loadFieldMappings()[fileType];
}

// ---------- 映射健康检查核心 ----------

function checkMappingHealth(fileType, headers, mappings) {
  const saved = getSavedMappingForType(fileType);
  const labels = FIELD_LABELS[fileType];
  const issues = [];

  const savedMappings = saved?.mappings || [];
  const savedHeaders = saved?.headers || [];

  const headerSet = new Set(headers);
  const normalizedSavedHeaders = new Set(savedHeaders.map(normalizeHeader));

  const invalidatedSourceColumns = [];
  for (const sm of savedMappings) {
    if (sm.sourceColumn && !headerSet.has(sm.sourceColumn)) {
      invalidatedSourceColumns.push({
        targetField: sm.targetField,
        savedSourceColumn: sm.sourceColumn,
      });
      issues.push({
        type: 'source_column_invalidated',
        severity: 'warning',
        targetField: sm.targetField,
        sourceColumn: sm.sourceColumn,
        message: `字段 "${labels[sm.targetField] || sm.targetField}" 保存的源列 "${sm.sourceColumn}" 在当前 CSV 中不存在，已失效`,
      });
    }
  }

  const newColumns = [];
  for (const h of headers) {
    if (savedHeaders.length > 0 && !normalizedSavedHeaders.has(normalizeHeader(h))) {
      newColumns.push(h);
      issues.push({
        type: 'new_column_detected',
        severity: 'info',
        sourceColumn: h,
        message: `检测到新增列 "${h}"，请确认是否需要映射到目标字段`,
      });
    }
  }

  const missingRequiredFields = [];
  for (const m of mappings) {
    if (m.isRequired && !m.sourceColumn) {
      missingRequiredFields.push(m.targetField);
      issues.push({
        type: 'missing_required',
        severity: 'error',
        targetField: m.targetField,
        message: `必填字段 "${labels[m.targetField] || m.targetField}" 未映射，将阻断导入`,
      });
    }
  }

  const conflictingSourceColumns = [];
  const colUsage = new Map();
  for (const m of mappings) {
    if (!m.sourceColumn) continue;
    if (!colUsage.has(m.sourceColumn)) colUsage.set(m.sourceColumn, []);
    colUsage.get(m.sourceColumn).push(m.targetField);
  }
  for (const [col, fields] of colUsage.entries()) {
    if (fields.length > 1) {
      conflictingSourceColumns.push({ sourceColumn: col, targetFields: fields });
      issues.push({
        type: 'source_column_conflict',
        severity: 'error',
        sourceColumn: col,
        message: `源列 "${col}" 被同时映射到 ${fields.map((f) => `"${labels[f] || f}"`).join('、')}，存在冲突`,
      });
    }
  }

  const savedMappingApplied = savedMappings.length > 0;
  if (savedMappingApplied && invalidatedSourceColumns.length === 0) {
    issues.unshift({
      type: 'saved_mapping_applied',
      severity: 'info',
      message: `已沿用本地保存的映射配置（保存于 ${saved?.savedAt ? new Date(saved.savedAt).toLocaleString('zh-CN') : '未知时间'}）`,
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  return {
    savedMappingApplied,
    invalidatedSourceColumns,
    newColumns,
    missingRequiredFields,
    conflictingSourceColumns,
    issues,
    isHealthy: !hasErrors,
    needsUserAttention: hasErrors || hasWarnings || newColumns.length > 0 || invalidatedSourceColumns.length > 0,
  };
}

// ---------- 审计日志元数据构建 ----------

function buildBlockedAuditMetadata(fileType, fileName, headers, healthReport, mappings) {
  const mappingSnapshot = mappings.map((m) => ({
    targetField: m.targetField,
    sourceColumn: m.sourceColumn,
  }));
  return {
    fileName,
    fileType,
    headers,
    invalidatedFields: healthReport.invalidatedSourceColumns,
    newColumns: healthReport.newColumns,
    missingRequiredFields: healthReport.missingRequiredFields,
    conflictingSourceColumns: healthReport.conflictingSourceColumns,
    fieldMappings: mappingSnapshot,
  };
}

function buildImportAuditMetadata(fileName, validRows, invalidRows, headers, mappings) {
  return {
    fileName,
    validRows,
    invalidRows,
    headers,
    fieldMappings: mappings?.map((m) => ({
      targetField: m.targetField,
      sourceColumn: m.sourceColumn,
    })),
  };
}

// ---------- 测试开始 ----------

let passCount = 0;
let failCount = 0;
const failures = [];

const test = (name, fn) => {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failCount++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
};

const section = (name) => {
  console.log(`\n🔹 ${name}`);
};

console.log('===========================================================');
console.log(' 冷链温控看板 · 映射健康检查 + 可追溯导入 核心功能测试');
console.log('===========================================================');

// ---------- 1. 源列失效检测 ----------
section('1. 源列失效检测（保存的映射指向不存在的列）');

test('保存的 batchId 源列失效 → 正确识别', () => {
  mockStorage = {};
  // 先保存映射
  const savedHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  // 当前 CSV 缺少「批次号」列
  const currentHeaders = ['产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.invalidatedSourceColumns.length, 1);
  assert.equal(health.invalidatedSourceColumns[0].targetField, 'batchId');
  assert.equal(health.invalidatedSourceColumns[0].savedSourceColumn, '批次号');

  const issue = health.issues.find((i) => i.type === 'source_column_invalidated');
  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
  assert.ok(issue.message.includes('批次号'));
  assert.equal(health.needsUserAttention, true);
});

test('多个源列同时失效 → 全部列出', () => {
  mockStorage = {};
  const savedHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  const currentHeaders = ['最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.invalidatedSourceColumns.length, 3);
  const invalidatedFields = health.invalidatedSourceColumns.map((i) => i.targetField).sort();
  assert.deepEqual(invalidatedFields, ['arrivalTime', 'batchId', 'productName']);
});

test('源列均存在 → 无失效，needsUserAttention 可能为 true 取决于其他问题', () => {
  mockStorage = {};
  const savedHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  const currentHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.invalidatedSourceColumns.length, 0);
  assert.equal(health.isHealthy, true);
});

test('失效时不会静默套旧映射（失效列不在当前映射中，且健康检查明确标注）', () => {
  mockStorage = {};
  const savedHeaders = ['OLD批次号', '产品名称'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: 'OLD批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  // 当前 CSV 的批次号列名完全不同，旧列已不存在
  const currentHeaders = ['完全不同的列', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  // 1. 当前映射的 batchId 不会被静默套用到 OLD批次号（因为该列根本不存在）
  const batchIdMapping = mappings.find((m) => m.targetField === 'batchId');
  // 2. 失效列检测：OLD批次号 已被报告为失效
  assert.equal(health.invalidatedSourceColumns.length, 1);
  assert.equal(health.invalidatedSourceColumns[0].savedSourceColumn, 'OLD批次号');
  assert.equal(health.invalidatedSourceColumns[0].targetField, 'batchId');
  // 3. 失效的源列 OLD批次号 **不会** 出现在当前任何映射中
  for (const m of mappings) {
    assert.notEqual(m.sourceColumn, 'OLD批次号');
  }
});

// ---------- 2. 新增列检测 ----------
section('2. 新增列检测（当前 CSV 有保存时未有的列）');

test('出现新增列 → 正确识别', () => {
  mockStorage = {};
  const savedHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  const currentHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度', '新增备注列', '运输公司'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.newColumns.length, 2);
  assert.ok(health.newColumns.includes('新增备注列'));
  assert.ok(health.newColumns.includes('运输公司'));
  assert.equal(health.needsUserAttention, true);

  const infoIssues = health.issues.filter((i) => i.type === 'new_column_detected');
  assert.equal(infoIssues.length, 2);
  assert.equal(infoIssues[0].severity, 'info');
});

test('首次导入（无保存映射）→ 不提示新增列', () => {
  mockStorage = {};
  const currentHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.newColumns.length, 0);
});

test('归一化比较：大小写/空格差异不算新增列', () => {
  mockStorage = {};
  const savedHeaders = ['Batch ID', ' product_name ', 'Arrival_Time', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: 'Batch ID' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  const currentHeaders = ['batchId', 'ProductName', 'arrivalTime', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.newColumns.length, 0);
});

// ---------- 3. 必填缺失检测 ----------
section('3. 必填缺失检测（阻断级别错误）');

test('缺少 batchId 必填字段 → error 级别，isHealthy=false', () => {
  mockStorage = {};
  const headers = ['产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', headers);
  const health = checkMappingHealth('arrival', headers, mappings);

  assert.equal(health.missingRequiredFields.includes('batchId'), true);
  assert.equal(health.isHealthy, false);
  const errIssue = health.issues.find((i) => i.targetField === 'batchId' && i.type === 'missing_required');
  assert.ok(errIssue);
  assert.equal(errIssue.severity, 'error');
});

test('温度日志缺少 temperature → 阻断', () => {
  mockStorage = {};
  const headers = ['批次号', '采集时间'];
  const mappings = autoMatchField('log', headers);
  const health = checkMappingHealth('log', headers, mappings);

  assert.equal(health.missingRequiredFields.includes('temperature'), true);
  assert.equal(health.isHealthy, false);
});

test('所有必填均已映射 → isHealthy=true', () => {
  mockStorage = {};
  const headers = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', headers);
  const health = checkMappingHealth('arrival', headers, mappings);

  assert.equal(health.missingRequiredFields.length, 0);
  assert.equal(health.isHealthy, true);
});

// ---------- 4. 同源冲突检测 ----------
section('4. 同源冲突检测（同一列映射到多个字段）');

test('同一列映射到 batchId 和 productName → 冲突阻断', () => {
  mockStorage = {};
  const headers = ['同一列', '到货时间', '最低温度', '最高温度'];
  const mappings = [
    { targetField: 'batchId', sourceColumn: '同一列', isRequired: true, matchedAutomatically: false },
    { targetField: 'productName', sourceColumn: '同一列', isRequired: true, matchedAutomatically: false },
    { targetField: 'arrivalTime', sourceColumn: '到货时间', isRequired: true, matchedAutomatically: true },
    { targetField: 'requiredTempMin', sourceColumn: '最低温度', isRequired: true, matchedAutomatically: true },
    { targetField: 'requiredTempMax', sourceColumn: '最高温度', isRequired: true, matchedAutomatically: true },
  ];
  const health = checkMappingHealth('arrival', headers, mappings);

  assert.equal(health.conflictingSourceColumns.length, 1);
  assert.equal(health.conflictingSourceColumns[0].sourceColumn, '同一列');
  assert.deepEqual(health.conflictingSourceColumns[0].targetFields.sort(), ['batchId', 'productName']);
  assert.equal(health.isHealthy, false);

  const conflictIssue = health.issues.find((i) => i.type === 'source_column_conflict');
  assert.ok(conflictIssue);
  assert.equal(conflictIssue.severity, 'error');
});

test('三字段同列 → 全部列入冲突', () => {
  mockStorage = {};
  const headers = ['X'];
  const mappings = [
    { targetField: 'batchId', sourceColumn: 'X', isRequired: true, matchedAutomatically: false },
    { targetField: 'timestamp', sourceColumn: 'X', isRequired: true, matchedAutomatically: false },
    { targetField: 'temperature', sourceColumn: 'X', isRequired: true, matchedAutomatically: false },
  ];
  const health = checkMappingHealth('log', headers, mappings);

  assert.equal(health.conflictingSourceColumns.length, 1);
  assert.equal(health.conflictingSourceColumns[0].targetFields.length, 3);
});

// ---------- 5. localStorage 持久化 ----------
section('5. localStorage 持久化（按文件类型隔离 + 刷新保留 + 新旧格式兼容）');

test('保存后按文件类型读取，互不串用', () => {
  mockStorage = {};
  saveFieldMappings('arrival',
    [{ targetField: 'batchId', sourceColumn: 'arrival批次' }],
    ['arrival批次']);
  saveFieldMappings('log',
    [{ targetField: 'batchId', sourceColumn: 'log批次' }],
    ['log批次']);
  saveFieldMappings('review',
    [{ targetField: 'batchId', sourceColumn: 'review批次' }],
    ['review批次']);

  const a = getSavedMappingForType('arrival');
  const l = getSavedMappingForType('log');
  const r = getSavedMappingForType('review');

  assert.equal(a.mappings[0].sourceColumn, 'arrival批次');
  assert.equal(l.mappings[0].sourceColumn, 'log批次');
  assert.equal(r.mappings[0].sourceColumn, 'review批次');
  assert.equal(a.headers[0], 'arrival批次');
  assert.equal(l.headers[0], 'log批次');
  assert.equal(r.headers[0], 'review批次');
});

test('刷新（清空变量但保留 mockStorage）后仍可读取', () => {
  mockStorage = {};
  saveFieldMappings('arrival',
    [{ targetField: 'batchId', sourceColumn: '批次号' }],
    ['批次号', '产品名称']);

  // 模拟刷新：不重置 mockStorage，直接读取
  const afterRefresh = getSavedMappingForType('arrival');
  assert.ok(afterRefresh);
  assert.equal(afterRefresh.mappings[0].targetField, 'batchId');
  assert.equal(afterRefresh.mappings[0].sourceColumn, '批次号');
  assert.deepEqual(afterRefresh.headers, ['批次号', '产品名称']);
  assert.ok(new Date(afterRefresh.savedAt).getTime() > 0);
});

test('旧格式兼容（保存值为数组，无 headers/savedAt）', () => {
  mockStorage = {};
  // 手动写入旧格式（纯数组）
  mockStorage[FIELD_MAPPING_STORAGE_KEY] = JSON.stringify({
    arrival: [{ targetField: 'batchId', sourceColumn: '旧批次号' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const loaded = loadFieldMappings();
  assert.ok(loaded.arrival);
  assert.ok(Array.isArray(loaded.arrival.mappings));
  assert.equal(loaded.arrival.mappings[0].sourceColumn, '旧批次号');
  assert.deepEqual(loaded.arrival.headers, []);
  assert.ok(loaded.arrival.savedAt);
});

test('新格式（mappings + headers + savedAt）正确读取', () => {
  mockStorage = {};
  saveFieldMappings('log',
    [{ targetField: 'temperature', sourceColumn: '温度' }],
    ['批次号', '温度', '时间']);

  const loaded = loadFieldMappings();
  assert.ok(loaded.log);
  assert.equal(loaded.log.mappings[0].targetField, 'temperature');
  assert.deepEqual(loaded.log.headers, ['批次号', '温度', '时间']);
  assert.ok(loaded.log.savedAt);
  assert.ok(loaded.updatedAt);
});

// ---------- 6. 审计日志元数据结构 ----------
section('6. 审计日志元数据结构（阻断/导入/变更/导出 统一带快照）');

test('阻断审计元数据包含：文件类型、文件名、原因、失效字段、当前表头、映射快照', () => {
  mockStorage = {};
  // 先保存一份映射让部分列失效
  saveFieldMappings('arrival',
    [{ targetField: 'batchId', sourceColumn: 'OLD批次号' }, { targetField: 'productName', sourceColumn: '产品名称' }],
    ['OLD批次号', '产品名称', '到货时间', '最低温度', '最高温度']);

  const currentHeaders = ['产品名称', '到货时间', '最低温度', '最高温度', '新增列'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  const metadata = buildBlockedAuditMetadata('arrival', '到货清单.csv', currentHeaders, health, mappings);

  assert.equal(metadata.fileName, '到货清单.csv');
  assert.equal(metadata.fileType, 'arrival');
  assert.deepEqual(metadata.headers, currentHeaders);
  assert.ok(Array.isArray(metadata.invalidatedFields));
  assert.ok(metadata.invalidatedFields.length > 0);
  assert.ok(metadata.newColumns.includes('新增列'));
  assert.ok(Array.isArray(metadata.fieldMappings));
  assert.ok(metadata.fieldMappings.length > 0);
  for (const m of metadata.fieldMappings) {
    assert.ok('targetField' in m);
    assert.ok('sourceColumn' in m);
  }
});

test('成功导入审计元数据包含：文件名、行数、表头、映射快照', () => {
  const headers = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', headers);
  const meta = buildImportAuditMetadata('到货.csv', 10, 2, headers, mappings);

  assert.equal(meta.fileName, '到货.csv');
  assert.equal(meta.validRows, 10);
  assert.equal(meta.invalidRows, 2);
  assert.deepEqual(meta.headers, headers);
  assert.ok(Array.isArray(meta.fieldMappings));
  assert.equal(meta.fieldMappings.length, mappings.length);
});

test('导出快照结构包含所有文件类型的完整信息', () => {
  mockStorage = {};
  saveFieldMappings('arrival',
    [{ targetField: 'batchId', sourceColumn: '批次号' }],
    ['批次号', '产品名称']);
  saveFieldMappings('log',
    [{ targetField: 'batchId', sourceColumn: '批次号' }, { targetField: 'temperature', sourceColumn: '温度' }],
    ['批次号', '时间', '温度']);
  saveFieldMappings('review',
    [{ targetField: 'batchId', sourceColumn: '批次号' }],
    ['批次号', '复核人', '结论']);

  const snapshot = loadFieldMappings();
  assert.ok(snapshot.arrival);
  assert.ok(snapshot.log);
  assert.ok(snapshot.review);
  assert.ok(snapshot.updatedAt);

  // 每个类型都有 mappings + headers + savedAt
  for (const ft of ['arrival', 'log', 'review']) {
    assert.ok(Array.isArray(snapshot[ft].mappings));
    assert.ok(Array.isArray(snapshot[ft].headers));
    assert.ok(snapshot[ft].savedAt);
  }
});

// ---------- 7. 综合场景 ----------
section('7. 综合场景');

test('场景A：表头变化（部分失效+新增）→ 正确识别所有问题且 needsUserAttention=true', () => {
  mockStorage = {};
  // 保存时使用了一个非常见列名
  const savedHeaders = ['供货商自编号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '供货商自编号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  // 当前 CSV：供货商自编号 被移除 → 失效；同时有新增列「运输车辆」
  // 但批次号（标准别名）仍然存在，batchId 会被自动匹配到「批次号」
  const currentHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度', '运输车辆'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  // 1. 失效列：保存映射中的「供货商自编号」已不在当前 CSV
  assert.equal(health.invalidatedSourceColumns.length, 1);
  assert.equal(health.invalidatedSourceColumns[0].targetField, 'batchId');
  assert.equal(health.invalidatedSourceColumns[0].savedSourceColumn, '供货商自编号');
  // 2. 新增列：批次号（相对于保存时的「供货商自编号」是新的）+ 运输车辆
  assert.equal(health.newColumns.length, 2);
  assert.ok(health.newColumns.includes('批次号'));
  assert.ok(health.newColumns.includes('运输车辆'));
  // 3. 需要用户关注，但没有阻断错误
  assert.equal(health.needsUserAttention, true);
  assert.equal(health.isHealthy, true);
  // 4. 当前实际映射是批次号，而不是已失效的「供货商自编号」
  const batchIdMapping = mappings.find((m) => m.targetField === 'batchId');
  assert.equal(batchIdMapping.sourceColumn, '批次号');
});

test('场景B：同时存在失效+新增+必填缺失+冲突 → isHealthy=false，全部列出', () => {
  mockStorage = {};
  saveFieldMappings('log',
    [{ targetField: 'batchId', sourceColumn: 'OLD批次' }],
    ['OLD批次', '采集时间', '温度']);

  const headers = ['同一列', '新增列'];
  const mappings = [
    { targetField: 'batchId', sourceColumn: '同一列', isRequired: true, matchedAutomatically: false },
    { targetField: 'timestamp', sourceColumn: '同一列', isRequired: true, matchedAutomatically: false },
    { targetField: 'temperature', sourceColumn: null, isRequired: true, matchedAutomatically: false },
  ];
  const health = checkMappingHealth('log', headers, mappings);

  assert.equal(health.isHealthy, false);
  assert.ok(health.invalidatedSourceColumns.length >= 1); // OLD批次 失效
  assert.ok(health.newColumns.length >= 1); // 同一列 + 新增列（归一化后至少新增列算）
  assert.ok(health.missingRequiredFields.includes('temperature'));
  assert.equal(health.conflictingSourceColumns.length, 1);
  assert.equal(health.needsUserAttention, true);
});

test('场景C：完美匹配 + 已保存映射 → saved_mapping_applied issue，isHealthy=true', () => {
  mockStorage = {};
  const savedHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const savedMappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
  ];
  saveFieldMappings('arrival', savedMappings, savedHeaders);

  const currentHeaders = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const mappings = autoMatchField('arrival', currentHeaders);
  const health = checkMappingHealth('arrival', currentHeaders, mappings);

  assert.equal(health.isHealthy, true);
  assert.equal(health.needsUserAttention, false);
  const appliedIssue = health.issues.find((i) => i.type === 'saved_mapping_applied');
  assert.ok(appliedIssue);
  assert.equal(appliedIssue.severity, 'info');
});

// ---------- 结果汇总 ----------
console.log('\n===========================================================');
console.log(` 测试结果：${passCount} 通过 · ${failCount} 失败`);
console.log('===========================================================');

if (failCount > 0) {
  console.log('\n失败详情：');
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.name}`);
    console.log(`     ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 全部通过！映射健康检查 + 可追溯导入核心逻辑运行正常。');
  console.log('   覆盖：源列失效、新增列、必填缺失、同源冲突、持久化隔离、审计快照');
  process.exit(0);
}
