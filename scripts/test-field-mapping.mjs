// 字段映射核心功能测试脚本
// 覆盖：自动匹配、冲突阻断、必填校验、刷新保留、导出快照
// 运行：node scripts/test-field-mapping.mjs

import assert from 'node:assert/strict';

// ---------- 以下代码从 src/types/index.ts 和 src/services/csvService.ts 提取的独立实现 ----------

const FILE_TYPES = {
  ARRIVAL: 'arrival',
  LOG: 'log',
  REVIEW: 'review',
};

const FIELD_ALIASES = {
  arrival: {
    batchId: ['batchId', 'batch_id', 'batch id', '批次号', '批次', '批号', 'BatchId', 'BATCH_ID', 'Batch ID'],
    productName: ['productName', 'product_name', '产品名称', '品名', 'Product Name', 'PRODUCT_NAME', 'Product'],
    arrivalTime: ['arrivalTime', 'arrival_time', 'arrival time', '到货时间', '到达时间', '入库时间', 'Arrival Time'],
    requiredTempMin: ['requiredTempMin', 'required_temp_min', '最低温度', '最低要求温度', '温度下限', 'Min Temp', 'Required Temp Min'],
    requiredTempMax: ['requiredTempMax', 'required_temp_max', '最高温度', '最高要求温度', '温度上限', 'Max Temp', 'Required Temp Max'],
    quantity: ['quantity', '数量', 'Qty', 'Quantity'],
    manufacturer: ['manufacturer', '生产厂家', '厂家', 'Manufacturer', 'Vendor'],
  },
  log: {
    batchId: ['batchId', 'batch_id', 'batch id', '批次号', '批次', '批号', 'BatchId', 'BATCH_ID'],
    timestamp: ['timestamp', 'time_stamp', '时间戳', '采集时间', '记录时间', '时间', 'Time', 'Timestamp'],
    temperature: ['temperature', 'temp', '温度', '采集温度', 'Temperature', 'TEMP'],
    humidity: ['humidity', '湿度', 'Humidity', 'HUM'],
    deviceId: ['deviceId', 'device_id', '设备编号', 'Device ID'],
  },
  review: {
    batchId: ['batchId', 'batch_id', '批次号', '批次', '批号', 'BatchId'],
    reviewer: ['reviewer', '复核人', '审核人', 'Reviewer', 'Review By'],
    conclusion: ['conclusion', '结论', '复核结论', 'Conclusion'],
    remark: ['remark', '备注', '说明', 'Remark', 'Note'],
    reviewTime: ['reviewTime', 'review_time', '复核时间', 'Review Time'],
  },
};

const REQUIRED_FIELDS = {
  arrival: ['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax'],
  log: ['batchId', 'timestamp', 'temperature'],
  review: ['batchId', 'reviewer', 'conclusion'],
};

const normalizeHeader = (h) => {
  if (!h) return '';
  return String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
};

const autoMatchField = (header, fileType, usedColumns = new Set()) => {
  const normalized = normalizeHeader(header);
  const aliases = FIELD_ALIASES[fileType];
  if (!aliases) return null;

  // 1. 精确别名匹配
  for (const [field, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      if (String(header).trim() === alias) {
        if (!usedColumns.has(field)) {
          usedColumns.add(field);
          return { field, method: 'exact', reason: `精确匹配别名 "${alias}"` };
        }
      }
    }
  }

  // 2. 归一化别名匹配
  for (const [field, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      if (normalized === normalizeHeader(alias)) {
        if (!usedColumns.has(field)) {
          usedColumns.add(field);
          return { field, method: 'normalized', reason: `归一化后匹配 "${alias}"` };
        }
      }
    }
  }

  // 3. 模糊包含匹配
  for (const [field, aliasList] of Object.entries(aliases)) {
    const nf = normalizeHeader(field);
    if (normalized.includes(nf) || nf.includes(normalized)) {
      if (!usedColumns.has(field)) {
        usedColumns.add(field);
        return { field, method: 'fuzzy', reason: `模糊包含匹配字段 "${field}"` };
      }
    }
    for (const alias of aliasList) {
      const na = normalizeHeader(alias);
      if (normalized.includes(na) || na.includes(normalized)) {
        if (!usedColumns.has(field)) {
          usedColumns.add(field);
          return { field, method: 'fuzzy', reason: `模糊包含匹配别名 "${alias}"` };
        }
      }
    }
  }

  return null;
};

const autoMatchAll = (headers, fileType) => {
  const usedColumns = new Set();
  const results = {};
  for (const h of headers) {
    const m = autoMatchField(h, fileType, usedColumns);
    if (m) results[h] = m;
  }
  return results;
};

const validateMappings = (mappings, headers, fileType) => {
  const errors = [];
  const warnings = [];

  // 1. 冲突检测：同一个源列映射到多个目标字段
  const colUsage = new Map();
  for (const m of mappings) {
    if (!m.sourceColumn) continue;
    if (!colUsage.has(m.sourceColumn)) colUsage.set(m.sourceColumn, []);
    colUsage.get(m.sourceColumn).push(m.targetField);
  }
  for (const [col, fields] of colUsage.entries()) {
    if (fields.length > 1) {
      errors.push({
        type: 'conflict',
        sourceColumn: col,
        targetFields: fields,
        message: `CSV 列 "${col}" 被映射到多个目标字段：${fields.join(', ')}`,
      });
    }
  }

  // 2. 必填字段缺失检测
  const mappedFields = new Set(mappings.filter((m) => m.sourceColumn).map((m) => m.targetField));
  const required = REQUIRED_FIELDS[fileType] || [];
  for (const field of required) {
    if (!mappedFields.has(field)) {
      errors.push({
        type: 'missing_required',
        targetField: field,
        message: `必填字段 "${field}" 未映射`,
      });
    }
  }

  // 3. 非必填字段缺失（仅警告）
  const allFields = Object.keys(FIELD_ALIASES[fileType] || {});
  for (const field of allFields) {
    if (!required.includes(field) && !mappedFields.has(field)) {
      warnings.push({
        type: 'missing_optional',
        targetField: field,
        message: `非必填字段 "${field}" 未映射`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
};

const STORAGE_KEY = 'cold-chain-field-mappings-v1';

let mockStorage = {};

const saveFieldMappings = (fileType, mappings, headers) => {
  try {
    const existing = JSON.parse(mockStorage[STORAGE_KEY] || '{}');
    existing[fileType] = {
      mappings,
      headers,
      savedAt: new Date().toISOString(),
    };
    mockStorage[STORAGE_KEY] = JSON.stringify(existing);
    return true;
  } catch {
    return false;
  }
};

const loadFieldMappings = () => {
  try {
    return JSON.parse(mockStorage[STORAGE_KEY] || '{}');
  } catch {
    return {};
  }
};

const getSavedMappingForType = (fileType) => {
  const all = loadFieldMappings();
  return all[fileType] || null;
};

const checkSavedMappingOutdated = (saved, currentHeaders) => {
  if (!saved || !saved.headers) return { outdated: false };
  const prev = new Set(saved.headers.map(normalizeHeader));
  const curr = new Set(currentHeaders.map(normalizeHeader));
  const added = currentHeaders.filter((h) => !prev.has(normalizeHeader(h)));
  const removed = saved.headers.filter((h) => !curr.has(normalizeHeader(h)));
  return {
    outdated: added.length > 0 || removed.length > 0,
    added,
    removed,
  };
};

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

console.log('============================================');
console.log(' 冷链温控看板 · 字段映射核心功能测试');
console.log('============================================');

// ---------- 1. 归一化函数 ----------
section('1. normalizeHeader 归一化');
test('去除首尾空格', () => assert.equal(normalizeHeader('  batchId  '), 'batchid'));
test('转换小写', () => assert.equal(normalizeHeader('BatchId'), 'batchid'));
test('去除空格', () => assert.equal(normalizeHeader('batch id'), 'batchid'));
test('去除下划线', () => assert.equal(normalizeHeader('batch_id'), 'batchid'));
test('去除连字符', () => assert.equal(normalizeHeader('batch-id'), 'batchid'));
test('混合处理', () => assert.equal(normalizeHeader(' Product-Name  '), 'productname'));
test('空值安全', () => assert.equal(normalizeHeader(null), ''));
test('空字符串', () => assert.equal(normalizeHeader(''), ''));

// ---------- 2. 自动匹配 ----------
section('2. autoMatchField 自动匹配');

test('精确英文匹配 batchId (arrival)', () => {
  const r = autoMatchField('batchId', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'batchId');
  assert.equal(r.method, 'exact');
});

test('精确中文匹配 批次号 (arrival)', () => {
  const r = autoMatchField('批次号', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'batchId');
  assert.equal(r.method, 'exact');
});

test('精确中文匹配 温度 (log)', () => {
  const r = autoMatchField('温度', FILE_TYPES.LOG, new Set());
  assert.ok(r);
  assert.equal(r.field, 'temperature');
});

test('别名中已含 BATCH_ID → 精确匹配', () => {
  const r = autoMatchField('BATCH_ID', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'batchId');
  assert.equal(r.method, 'exact');
});

test('别名中已含 Product Name → 精确匹配', () => {
  const r = autoMatchField('Product Name', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'productName');
  assert.equal(r.method, 'exact');
});

test('归一化匹配 BATCH-ID（下划线变连字符，别名不含）', () => {
  const r = autoMatchField('BATCH-ID', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'batchId');
  assert.equal(r.method, 'normalized');
});

test('归一化匹配 PRODUCTNAME（去空格/下划线，别名不含）', () => {
  const r = autoMatchField('PRODUCTNAME', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'productName');
  assert.equal(r.method, 'normalized');
});

test('归一化匹配 采集时间', () => {
  const r = autoMatchField('采集时间', FILE_TYPES.LOG, new Set());
  assert.ok(r);
  assert.equal(r.field, 'timestamp');
  assert.equal(r.method, 'exact');
});

test('模糊匹配 批次编号', () => {
  const r = autoMatchField('批次编号', FILE_TYPES.ARRIVAL, new Set());
  assert.ok(r);
  assert.equal(r.field, 'batchId');
  assert.equal(r.method, 'fuzzy');
});

test('模糊匹配 温度值', () => {
  const r = autoMatchField('温度值', FILE_TYPES.LOG, new Set());
  assert.ok(r);
  assert.equal(r.field, 'temperature');
});

test('未知表头返回 null', () => {
  const r = autoMatchField('完全不相关的列', FILE_TYPES.ARRIVAL, new Set());
  assert.equal(r, null);
});

test('已使用字段不会重复分配', () => {
  const used = new Set(['batchId']);
  const r = autoMatchField('批次号', FILE_TYPES.ARRIVAL, used);
  assert.equal(r, null);
});

// ---------- 3. 批量自动匹配 ----------
section('3. autoMatchAll 批量自动匹配');

test('到货清单英文标准表头全匹配', () => {
  const headers = ['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax', 'quantity'];
  const r = autoMatchAll(headers, FILE_TYPES.ARRIVAL);
  assert.equal(Object.keys(r).length, 6);
  assert.equal(r.batchId.field, 'batchId');
  assert.equal(r.productName.field, 'productName');
  assert.equal(r.requiredTempMax.field, 'requiredTempMax');
});

test('中文到货清单表头全匹配', () => {
  const headers = ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'];
  const r = autoMatchAll(headers, FILE_TYPES.ARRIVAL);
  assert.equal(Object.keys(r).length, 5);
  assert.equal(r['批次号'].field, 'batchId');
  assert.equal(r['产品名称'].field, 'productName');
  assert.equal(r['到货时间'].field, 'arrivalTime');
});

test('混合中英文大小写空格表头全匹配', () => {
  const headers = ['BATCH ID', ' Product-Name ', 'ARRIVAL_TIME', '最低温度', 'MAX-TEMP'];
  const r = autoMatchAll(headers, FILE_TYPES.ARRIVAL);
  assert.equal(r['BATCH ID'].field, 'batchId');
  assert.equal(r[' Product-Name '].field, 'productName');
  assert.equal(r['ARRIVAL_TIME'].field, 'arrivalTime');
  assert.equal(r['最低温度'].field, 'requiredTempMin');
  assert.equal(r['MAX-TEMP'].field, 'requiredTempMax');
});

test('温度日志中文表头匹配', () => {
  const headers = ['批次号', '采集时间', '温度', '湿度'];
  const r = autoMatchAll(headers, FILE_TYPES.LOG);
  assert.equal(r['批次号'].field, 'batchId');
  assert.equal(r['采集时间'].field, 'timestamp');
  assert.equal(r['温度'].field, 'temperature');
  assert.equal(r['湿度'].field, 'humidity');
});

test('人工复核中文表头匹配', () => {
  const headers = ['批次号', '复核人', '结论', '备注'];
  const r = autoMatchAll(headers, FILE_TYPES.REVIEW);
  assert.equal(r['批次号'].field, 'batchId');
  assert.equal(r['复核人'].field, 'reviewer');
  assert.equal(r['结论'].field, 'conclusion');
  assert.equal(r['备注'].field, 'remark');
});

// ---------- 4. 校验：必填字段缺失 ----------
section('4. validateMappings · 必填字段缺失阻断');

test('全部必填字段已映射 → 有效', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
    { targetField: 'requiredTempMin', sourceColumn: '最低温度' },
    { targetField: 'requiredTempMax', sourceColumn: '最高温度' },
  ];
  const v = validateMappings(mappings, ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'], FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, true);
  assert.equal(v.errors.length, 0);
});

test('缺少 batchId → 无效并说明原因', () => {
  const mappings = [
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
    { targetField: 'requiredTempMin', sourceColumn: '最低温度' },
    { targetField: 'requiredTempMax', sourceColumn: '最高温度' },
  ];
  const v = validateMappings(mappings, ['产品名称', '到货时间', '最低温度', '最高温度'], FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, false);
  const missing = v.errors.find((e) => e.type === 'missing_required' && e.targetField === 'batchId');
  assert.ok(missing);
  assert.ok(missing.message.includes('batchId'));
});

test('缺少多个必填字段 → 多个错误', () => {
  const mappings = [{ targetField: 'batchId', sourceColumn: '批次号' }];
  const v = validateMappings(mappings, ['批次号'], FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, false);
  const missingCount = v.errors.filter((e) => e.type === 'missing_required').length;
  assert.equal(missingCount, 4);
});

test('非必填字段缺失仅警告不阻断', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
    { targetField: 'requiredTempMin', sourceColumn: '最低温度' },
    { targetField: 'requiredTempMax', sourceColumn: '最高温度' },
  ];
  const v = validateMappings(mappings, ['批次号', '产品名称', '到货时间', '最低温度', '最高温度'], FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, true);
  const optWarnings = v.warnings.filter((w) => w.type === 'missing_optional');
  assert.ok(optWarnings.length >= 2);
});

// ---------- 5. 校验：列映射冲突 ----------
section('5. validateMappings · 列映射冲突阻断');

test('同一列映射到两个字段 → 冲突阻断', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: 'A列' },
    { targetField: 'productName', sourceColumn: 'A列' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
    { targetField: 'requiredTempMin', sourceColumn: '最低温度' },
    { targetField: 'requiredTempMax', sourceColumn: '最高温度' },
  ];
  const v = validateMappings(mappings, ['A列', '到货时间', '最低温度', '最高温度'], FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, false);
  const conflict = v.errors.find((e) => e.type === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.sourceColumn, 'A列');
  assert.deepEqual(conflict.targetFields.sort(), ['batchId', 'productName'].sort());
  assert.ok(conflict.message.includes('A列'));
});

test('同一列映射到三个字段 → 冲突阻断', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: 'X' },
    { targetField: 'timestamp', sourceColumn: 'X' },
    { targetField: 'temperature', sourceColumn: 'X' },
  ];
  const v = validateMappings(mappings, ['X'], FILE_TYPES.LOG);
  assert.equal(v.valid, false);
  const conflict = v.errors.find((e) => e.type === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.targetFields.length, 3);
});

test('不同列无冲突 → 有效', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: 'A' },
    { targetField: 'timestamp', sourceColumn: 'B' },
    { targetField: 'temperature', sourceColumn: 'C' },
  ];
  const v = validateMappings(mappings, ['A', 'B', 'C'], FILE_TYPES.LOG);
  assert.equal(v.valid, true);
  assert.equal(v.errors.filter((e) => e.type === 'conflict').length, 0);
});

test('空 sourceColumn 不计入冲突', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: '' },
    { targetField: 'timestamp', sourceColumn: '' },
    { targetField: 'temperature', sourceColumn: '' },
  ];
  const v = validateMappings(mappings, [], FILE_TYPES.LOG);
  // 因 sourceColumn 为空，不算冲突（但必填缺失会阻断）
  const conflictErrors = v.errors.filter((e) => e.type === 'conflict');
  assert.equal(conflictErrors.length, 0);
  assert.equal(v.valid, false); // 因必填缺失
});

// ---------- 6. 本地持久化与刷新保留 ----------
section('6. 本地持久化与刷新保留');

test('保存后可按文件类型读取', () => {
  mockStorage = {};
  const mappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
  ];
  const headers = ['批次号', '产品名称'];
  saveFieldMappings(FILE_TYPES.ARRIVAL, mappings, headers);

  const loaded = getSavedMappingForType(FILE_TYPES.ARRIVAL);
  assert.ok(loaded);
  assert.deepEqual(loaded.mappings, mappings);
  assert.deepEqual(loaded.headers, headers);
  assert.ok(loaded.savedAt);
});

test('不同文件类型独立存储', () => {
  mockStorage = {};
  saveFieldMappings(FILE_TYPES.ARRIVAL, [{ targetField: 'batchId', sourceColumn: '批次号' }], ['批次号']);
  saveFieldMappings(FILE_TYPES.LOG, [{ targetField: 'batchId', sourceColumn: 'log_batch' }], ['log_batch']);

  const a = getSavedMappingForType(FILE_TYPES.ARRIVAL);
  const l = getSavedMappingForType(FILE_TYPES.LOG);
  assert.equal(a.mappings[0].sourceColumn, '批次号');
  assert.equal(l.mappings[0].sourceColumn, 'log_batch');
});

test('未保存的文件类型返回 null', () => {
  mockStorage = {};
  assert.equal(getSavedMappingForType(FILE_TYPES.REVIEW), null);
});

test('刷新后 localStorage 保留（模拟刷新）', () => {
  mockStorage = {};
  saveFieldMappings(FILE_TYPES.ARRIVAL, [{ targetField: 'batchId', sourceColumn: '批次号' }], ['批次号']);
  // 模拟刷新：清空内存中的变量但保留 mockStorage
  const afterRefresh = getSavedMappingForType(FILE_TYPES.ARRIVAL);
  assert.ok(afterRefresh);
  assert.equal(afterRefresh.mappings[0].targetField, 'batchId');
});

// ---------- 7. 失效检测（表头变化） ----------
section('7. 表头变化失效检测');

test('表头完全一致 → 不失效', () => {
  const saved = { headers: ['批次号', '产品名称'] };
  const r = checkSavedMappingOutdated(saved, ['批次号', '产品名称']);
  assert.equal(r.outdated, false);
});

test('新增列 → 失效并提示', () => {
  const saved = { headers: ['批次号', '产品名称'] };
  const r = checkSavedMappingOutdated(saved, ['批次号', '产品名称', '新增列']);
  assert.equal(r.outdated, true);
  assert.deepEqual(r.added, ['新增列']);
  assert.deepEqual(r.removed, []);
});

test('删除列 → 失效并提示', () => {
  const saved = { headers: ['批次号', '产品名称', '备注'] };
  const r = checkSavedMappingOutdated(saved, ['批次号', '产品名称']);
  assert.equal(r.outdated, true);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed, ['备注']);
});

test('列顺序变化但内容相同 → 不失效', () => {
  const saved = { headers: ['批次号', '产品名称'] };
  const r = checkSavedMappingOutdated(saved, ['产品名称', '批次号']);
  assert.equal(r.outdated, false);
});

test('大小写/空格差异 → 不失效（归一化比较）', () => {
  const saved = { headers: ['Batch ID', ' product_name '] };
  const r = checkSavedMappingOutdated(saved, ['batchId', 'ProductName']);
  assert.equal(r.outdated, false);
});

test('既有新增又有删除 → 全部列出', () => {
  const saved = { headers: ['A', 'B', 'C'] };
  const r = checkSavedMappingOutdated(saved, ['A', 'D', 'E']);
  assert.equal(r.outdated, true);
  assert.deepEqual(r.added, ['D', 'E']);
  assert.deepEqual(r.removed, ['B', 'C']);
});

// ---------- 8. 导出 JSON 快照结构 ----------
section('8. 导出 JSON 字段映射快照');

test('loadFieldMappings 返回完整快照结构', () => {
  mockStorage = {};
  saveFieldMappings(FILE_TYPES.ARRIVAL, [{ targetField: 'batchId', sourceColumn: '批次号' }], ['批次号']);
  saveFieldMappings(FILE_TYPES.LOG, [{ targetField: 'batchId', sourceColumn: '批次号' }, { targetField: 'temperature', sourceColumn: '温度' }], ['批次号', '温度']);

  const snapshot = loadFieldMappings();
  assert.ok(snapshot.arrival);
  assert.ok(snapshot.log);
  assert.equal(snapshot.arrival.mappings.length, 1);
  assert.equal(snapshot.log.mappings.length, 2);
  assert.ok(snapshot.arrival.savedAt);
  assert.ok(snapshot.log.savedAt);
});

test('快照包含完整映射信息（targetField + sourceColumn + headers + savedAt）', () => {
  mockStorage = {};
  const mappings = [
    { targetField: 'batchId', sourceColumn: '批次号' },
    { targetField: 'productName', sourceColumn: '产品名称' },
    { targetField: 'arrivalTime', sourceColumn: '到货时间' },
  ];
  const headers = ['批次号', '产品名称', '到货时间'];
  saveFieldMappings(FILE_TYPES.ARRIVAL, mappings, headers);

  const snap = loadFieldMappings();
  assert.deepEqual(snap.arrival.mappings, mappings);
  assert.deepEqual(snap.arrival.headers, headers);
  assert.ok(new Date(snap.arrival.savedAt).getTime() > 0); // 合法 ISO 时间
});

test('未保存任何映射时空快照', () => {
  mockStorage = {};
  const snap = loadFieldMappings();
  assert.deepEqual(snap, {});
});

// ---------- 9. 综合场景 ----------
section('9. 综合场景验证');

test('非标准中文 CSV → 自动匹配 → 校验通过 → 保存映射 → 刷新保留', () => {
  mockStorage = {};

  // Step 1: 非标准中文表头
  const headers = [' 批次编号 ', '产品-名称', '到货 时间', '最低要求温度', '最高温度', '数量'];
  const autoMatched = autoMatchAll(headers, FILE_TYPES.ARRIVAL);

  // Step 2: 构建映射
  const mappings = Object.entries(autoMatched).map(([col, m]) => ({
    targetField: m.field,
    sourceColumn: col,
  }));

  // Step 3: 校验
  const v = validateMappings(mappings, headers, FILE_TYPES.ARRIVAL);
  assert.equal(v.valid, true, `校验失败：${JSON.stringify(v.errors)}`);

  // Step 4: 保存
  saveFieldMappings(FILE_TYPES.ARRIVAL, mappings, headers);

  // Step 5: 模拟刷新后读取
  const afterRefresh = getSavedMappingForType(FILE_TYPES.ARRIVAL);
  assert.ok(afterRefresh);
  assert.equal(afterRefresh.mappings.length, 6);
  assert.equal(afterRefresh.mappings.find((m) => m.targetField === 'batchId').sourceColumn, ' 批次编号 ');
  assert.equal(afterRefresh.mappings.find((m) => m.targetField === 'productName').sourceColumn, '产品-名称');
});

test('标准表头到货 + 温度日志 + 复核 → 全套自动匹配通过', () => {
  const arrivalHeaders = ['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax'];
  const logHeaders = ['batchId', 'timestamp', 'temperature'];
  const reviewHeaders = ['batchId', 'reviewer', 'conclusion'];

  const a = autoMatchAll(arrivalHeaders, FILE_TYPES.ARRIVAL);
  const l = autoMatchAll(logHeaders, FILE_TYPES.LOG);
  const r = autoMatchAll(reviewHeaders, FILE_TYPES.REVIEW);

  assert.equal(Object.keys(a).length, 5);
  assert.equal(Object.keys(l).length, 3);
  assert.equal(Object.keys(r).length, 3);

  const va = validateMappings(
    Object.entries(a).map(([c, m]) => ({ targetField: m.field, sourceColumn: c })),
    arrivalHeaders,
    FILE_TYPES.ARRIVAL,
  );
  const vl = validateMappings(
    Object.entries(l).map(([c, m]) => ({ targetField: m.field, sourceColumn: c })),
    logHeaders,
    FILE_TYPES.LOG,
  );
  const vr = validateMappings(
    Object.entries(r).map(([c, m]) => ({ targetField: m.field, sourceColumn: c })),
    reviewHeaders,
    FILE_TYPES.REVIEW,
  );

  assert.equal(va.valid, true);
  assert.equal(vl.valid, true);
  assert.equal(vr.valid, true);
});

test('冲突 + 必填缺失同时存在 → 两类错误均列出', () => {
  const mappings = [
    { targetField: 'batchId', sourceColumn: 'A' },
    { targetField: 'timestamp', sourceColumn: 'A' },
  ];
  const v = validateMappings(mappings, ['A'], FILE_TYPES.LOG);
  assert.equal(v.valid, false);

  const conflicts = v.errors.filter((e) => e.type === 'conflict');
  const missing = v.errors.filter((e) => e.type === 'missing_required');
  assert.ok(conflicts.length >= 1, '应有冲突错误');
  assert.ok(missing.length >= 1, '应有必填缺失错误');
});

// ---------- 结果汇总 ----------
console.log('\n============================================');
console.log(` 测试结果：${passCount} 通过 · ${failCount} 失败`);
console.log('============================================');

if (failCount > 0) {
  console.log('\n失败详情：');
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.name}`);
    console.log(`     ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 全部通过！字段映射核心逻辑运行正常。');
  process.exit(0);
}
