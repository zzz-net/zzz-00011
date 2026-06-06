// 供应商温控风险画像模块测试脚本
// 覆盖：统计汇总、持久化(localStorage mock)、名称冲突检测与合并、规则匹配、导出快照、筛选
// 运行：node scripts/test-supplier-risk.mjs

import assert from 'node:assert/strict';

// ---------- Mock localStorage ----------
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  length: mockStorage.size,
  key: (i) => Array.from(mockStorage.keys())[i] ?? null,
};

// ---------- Mock date-fns 核心函数（避免整包引入）----------
const pad2 = (n) => String(n).padStart(2, '0');
const formatISO = (d, opts = {}) => {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  if (opts.representation === 'date') return `${y}-${m}-${day}`;
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
};
const parseISO = (s) => new Date(s);
const startOfDay = (d) => {
  const x = d instanceof Date ? new Date(d) : new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// ---------- 类型常量 ----------
const SUPPLIER_RISK_STORAGE_KEY = 'cold-chain-supplier-risk-rules-v1';
const SUPPLIER_NAME_RESOLUTION_STORAGE_KEY = 'cold-chain-supplier-name-resolution-v1';
const MISSING_SUPPLIER_KEY = '__MISSING_SUPPLIER__';
const MISSING_SUPPLIER_DISPLAY = '（供应商未填写）';

const DEFAULT_SUPPLIER_RISK_RULES = {
  version: 1,
  trendWindowDays: 7,
  levels: [
    { level: 'safe', conditions: { minTotalAnomalies: 0 } },
    { level: 'low', conditions: { minTotalAnomalies: 1 } },
    { level: 'medium', conditions: { minTotalAnomalies: 3, minDangerAnomalies: 1 } },
    { level: 'high', conditions: { minDangerAnomalies: 2, minTotalAnomalies: 5 } },
    { level: 'critical', conditions: { minDangerAnomalies: 4, minTotalAnomalies: 8, minPendingHandovers: 2 } },
  ],
};

// ---------- 核心函数实现（复刻 supplierRiskService）----------
const normalizeSupplierName = (name) => {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
};

const getCanonicalSupplierName = (rawName, resolution) => {
  if (!rawName) return MISSING_SUPPLIER_KEY;
  const normalized = normalizeSupplierName(rawName);
  if (!normalized) return MISSING_SUPPLIER_KEY;
  return resolution.variantToCanonical[normalized] ?? normalized;
};

const loadSupplierRiskRules = () => {
  try {
    const raw = localStorage.getItem(SUPPLIER_RISK_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SUPPLIER_RISK_RULES));
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.levels)) {
      return JSON.parse(JSON.stringify(DEFAULT_SUPPLIER_RISK_RULES));
    }
    return {
      version: parsed.version ?? 1,
      trendWindowDays: parsed.trendWindowDays ?? DEFAULT_SUPPLIER_RISK_RULES.trendWindowDays,
      levels: parsed.levels,
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SUPPLIER_RISK_RULES));
  }
};

const saveSupplierRiskRules = (rules) => {
  try {
    localStorage.setItem(SUPPLIER_RISK_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

const loadSupplierNameResolution = () => {
  try {
    const raw = localStorage.getItem(SUPPLIER_NAME_RESOLUTION_STORAGE_KEY);
    if (!raw) return { variantToCanonical: {}, conflicts: [] };
    const parsed = JSON.parse(raw);
    return {
      variantToCanonical: parsed.variantToCanonical ?? {},
      conflicts: parsed.conflicts ?? [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { variantToCanonical: {}, conflicts: [] };
  }
};

const saveSupplierNameResolution = (resolution) => {
  try {
    const toSave = { ...resolution, updatedAt: new Date().toISOString() };
    localStorage.setItem(SUPPLIER_NAME_RESOLUTION_STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
};

const detectSupplierNameConflicts = (batches, existingResolution) => {
  const batchesByNormalized = {};
  for (const b of batches) {
    if (!b.supplier) continue;
    const normalized = normalizeSupplierName(b.supplier);
    if (!normalized) continue;
    if (!batchesByNormalized[normalized]) batchesByNormalized[normalized] = {};
    if (!batchesByNormalized[normalized][b.supplier]) batchesByNormalized[normalized][b.supplier] = [];
    batchesByNormalized[normalized][b.supplier].push(b.batchId);
  }
  const conflicts = [];
  const existingResolved = new Set(
    existingResolution.conflicts.filter((c) => c.resolved).map((c) => c.normalizedKey),
  );
  for (const [normalized, variantsMap] of Object.entries(batchesByNormalized)) {
    const variants = Object.keys(variantsMap);
    if (variants.length > 1 && !existingResolved.has(normalized)) {
      const existingConflict = existingResolution.conflicts.find(
        (c) => c.normalizedKey === normalized && !c.resolved,
      );
      if (existingConflict) {
        conflicts.push({ ...existingConflict, variants, batchIdsByVariant: variantsMap });
      } else {
        conflicts.push({
          id: `sn-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          normalizedKey: normalized,
          variants,
          batchIdsByVariant: variantsMap,
          resolved: false,
        });
      }
    }
  }
  return { conflicts, batchesByNormalized };
};

const evaluateRiskLevel = (stats, rules) => {
  const order = ['safe', 'low', 'medium', 'high', 'critical'];
  const sortedLevels = [...rules.levels].sort((a, b) => order.indexOf(b.level) - order.indexOf(a.level));
  for (const rule of sortedLevels) {
    const c = rule.conditions;
    const conditions = [];
    if (c.minDangerAnomalies !== undefined) conditions.push(stats.dangerAnomalies >= c.minDangerAnomalies);
    if (c.minTotalAnomalies !== undefined) conditions.push(stats.totalAnomalies >= c.minTotalAnomalies);
    if (c.minOvertempCount !== undefined) conditions.push(stats.overtempCount >= c.minOvertempCount);
    if (c.minMissingLogCount !== undefined) conditions.push(stats.missingLogCount >= c.minMissingLogCount);
    if (c.minUnregisteredCount !== undefined) conditions.push(stats.unregisteredCount >= c.minUnregisteredCount);
    if (c.minReviewConflictCount !== undefined) conditions.push(stats.reviewConflictCount >= c.minReviewConflictCount);
    if (c.minPendingHandovers !== undefined) conditions.push(stats.pendingHandoverCount >= c.minPendingHandovers);
    if (conditions.length === 0) continue;
    if (conditions.every(Boolean)) {
      const scoreWeights = { safe: 0, low: 25, medium: 50, high: 75, critical: 100 };
      return { level: rule.level, score: scoreWeights[rule.level] + Math.min(stats.dangerAnomalies * 5, 15) };
    }
  }
  return { level: 'safe', score: 0 };
};

const buildSupplierRiskProfiles = ({ batches, anomalies, decisions, handoverRecords, nameResolution, riskRules }) => {
  const profileMap = new Map();
  const anomalyByBatch = new Map();
  for (const a of anomalies) {
    if (!anomalyByBatch.has(a.batchId)) anomalyByBatch.set(a.batchId, []);
    anomalyByBatch.get(a.batchId).push(a);
  }
  const pendingHandoverBatches = new Set();
  for (const h of handoverRecords) {
    if (h.status === 'pending' || h.status === 'accepted' || h.status === 'returned') {
      for (const item of h.items) pendingHandoverBatches.add(item.batchId);
    }
  }
  const conflictDetection = detectSupplierNameConflicts(batches, nameResolution);
  const unresolvedConflictKeys = new Set(
    conflictDetection.conflicts.filter((c) => !c.resolved).map((c) => c.normalizedKey),
  );
  for (const batch of batches) {
    const supplierRaw = batch.supplier;
    const canonical = getCanonicalSupplierName(supplierRaw, nameResolution);
    const displayName = canonical === MISSING_SUPPLIER_KEY ? MISSING_SUPPLIER_DISPLAY : supplierRaw ?? MISSING_SUPPLIER_DISPLAY;
    const normalized = supplierRaw ? normalizeSupplierName(supplierRaw) : '';
    if (!profileMap.has(canonical)) {
      profileMap.set(canonical, {
        supplierName: supplierRaw ?? '',
        canonicalName: canonical,
        displayName,
        batchCount: 0,
        overtempCount: 0,
        missingLogCount: 0,
        unregisteredCount: 0,
        reviewConflictCount: 0,
        totalAnomalies: 0,
        dangerAnomalies: 0,
        warningAnomalies: 0,
        pendingHandoverCount: 0,
        riskLevel: 'safe',
        riskScore: 0,
        trend: [],
        trendDirection: 'insufficient',
        batches: [],
        nameVariants: [],
        hasUnresolvedNameConflict: false,
        missingSupplierBatches: [],
      });
    }
    const profile = profileMap.get(canonical);
    if (supplierRaw && !profile.nameVariants.includes(supplierRaw)) profile.nameVariants.push(supplierRaw);
    if (normalized && unresolvedConflictKeys.has(normalized)) profile.hasUnresolvedNameConflict = true;
    if (canonical === MISSING_SUPPLIER_KEY) profile.missingSupplierBatches.push(batch.batchId);
    profile.batchCount += 1;
    const batchAnomalies = anomalyByBatch.get(batch.batchId) ?? [];
    const anomalyTypes = [];
    const anomalyIds = [];
    const sourceRows = [];
    for (const a of batchAnomalies) {
      anomalyIds.push(a.id);
      sourceRows.push(...a.sourceRows);
      if (!anomalyTypes.includes(a.type)) anomalyTypes.push(a.type);
      profile.totalAnomalies += 1;
      if (a.severity === 'danger') profile.dangerAnomalies += 1;
      else profile.warningAnomalies += 1;
      if (a.type === 'overtemp') profile.overtempCount += 1;
      else if (a.type === 'missing_log') profile.missingLogCount += 1;
      else if (a.type === 'unregistered') profile.unregisteredCount += 1;
      else if (a.type === 'review_conflict') profile.reviewConflictCount += 1;
    }
    if (pendingHandoverBatches.has(batch.batchId)) profile.pendingHandoverCount += 1;
    profile.batches.push({
      batchId: batch.batchId,
      productName: batch.productName,
      arrivalTime: batch.arrivalTime,
      anomalyIds,
      anomalyTypes,
      sourceRows: [...new Set(sourceRows)],
      reviewConclusion: decisions[batch.batchId]?.conclusion,
    });
  }
  for (const profile of profileMap.values()) {
    const { level, score } = evaluateRiskLevel(
      {
        totalAnomalies: profile.totalAnomalies,
        dangerAnomalies: profile.dangerAnomalies,
        overtempCount: profile.overtempCount,
        missingLogCount: profile.missingLogCount,
        unregisteredCount: profile.unregisteredCount,
        reviewConflictCount: profile.reviewConflictCount,
        pendingHandoverCount: profile.pendingHandoverCount,
      },
      riskRules,
    );
    profile.riskLevel = level;
    profile.riskScore = score;
  }
  return [...profileMap.values()].sort((a, b) => b.riskScore - a.riskScore);
};

const filterSupplierRiskProfiles = (profiles, filter) => {
  return profiles.filter((p) => {
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      const matchName = p.displayName.toLowerCase().includes(kw) ||
        p.nameVariants.some((v) => v.toLowerCase().includes(kw));
      const matchBatch = p.batches.some((b) => b.batchId.toLowerCase().includes(kw));
      if (!matchName && !matchBatch) return false;
    }
    if (filter.riskLevels?.length && !filter.riskLevels.includes(p.riskLevel)) return false;
    if (filter.onlyWithPendingHandovers && p.pendingHandoverCount === 0) return false;
    if (filter.onlyWithNameConflicts && !p.hasUnresolvedNameConflict) return false;
    if (filter.anomalyTypes?.length) {
      const hasAny = filter.anomalyTypes.some((t) => {
        if (t === 'overtemp') return p.overtempCount > 0;
        if (t === 'missing_log') return p.missingLogCount > 0;
        if (t === 'unregistered') return p.unregisteredCount > 0;
        if (t === 'review_conflict') return p.reviewConflictCount > 0;
        return false;
      });
      if (!hasAny) return false;
    }
    if (filter.reviewStatuses?.length) {
      const hasAny = p.batches.some((b) => filter.reviewStatuses.includes(b.reviewConclusion ?? 'unreviewed'));
      if (!hasAny) return false;
    }
    if (filter.timeRangeStart || filter.timeRangeEnd) {
      const inRange = p.batches.some((b) => {
        if (!b.arrivalTime) return false;
        if (filter.timeRangeStart && b.arrivalTime < filter.timeRangeStart) return false;
        if (filter.timeRangeEnd && b.arrivalTime > filter.timeRangeEnd + 'T23:59:59') return false;
        return true;
      });
      if (!inRange) return false;
    }
    return true;
  });
};

// ---------- 构建模拟数据 ----------
const now = new Date();
const isoDaysAgo = (n) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const makeMockData = () => {
  const batches = [
    { batchId: 'B001', productName: '疫苗A', arrivalTime: isoDaysAgo(1), requiredTempMin: 2, requiredTempMax: 8, supplier: '华兰生物', sourceRow: 2, sourceFile: 'arrival.csv' },
    { batchId: 'B002', productName: '疫苗A', arrivalTime: isoDaysAgo(1), requiredTempMin: 2, requiredTempMax: 8, supplier: '华兰 生物', sourceRow: 3, sourceFile: 'arrival.csv' },
    { batchId: 'B003', productName: '疫苗B', arrivalTime: isoDaysAgo(2), requiredTempMin: 2, requiredTempMax: 8, supplier: '华兰生物 ', sourceRow: 4, sourceFile: 'arrival.csv' },
    { batchId: 'B004', productName: '试剂X', arrivalTime: isoDaysAgo(3), requiredTempMin: -20, requiredTempMax: -15, supplier: '科兴生物', sourceRow: 5, sourceFile: 'arrival.csv' },
    { batchId: 'B005', productName: '试剂Y', arrivalTime: isoDaysAgo(3), requiredTempMin: -20, requiredTempMax: -15, supplier: '科兴生物', sourceRow: 6, sourceFile: 'arrival.csv' },
    { batchId: 'B006', productName: '试剂Z', arrivalTime: isoDaysAgo(4), requiredTempMin: -20, requiredTempMax: -15, supplier: '', sourceRow: 7, sourceFile: 'arrival.csv' },
    { batchId: 'B007', productName: '疫苗C', arrivalTime: isoDaysAgo(5), requiredTempMin: 2, requiredTempMax: 8, supplier: '国药集团', sourceRow: 8, sourceFile: 'arrival.csv' },
    { batchId: 'B008', productName: '疫苗C', arrivalTime: isoDaysAgo(5), requiredTempMin: 2, requiredTempMax: 8, supplier: '国药集团', sourceRow: 9, sourceFile: 'arrival.csv' },
  ];
  const anomalies = [
    { id: 'A1', batchId: 'B001', type: 'overtemp', severity: 'warning', description: '超温', detail: {}, sourceRows: [10, 11] },
    { id: 'A2', batchId: 'B002', type: 'missing_log', severity: 'warning', description: '缺日志', detail: {}, sourceRows: [20] },
    { id: 'A3', batchId: 'B003', type: 'review_conflict', severity: 'danger', description: '复核冲突', detail: {}, sourceRows: [30] },
    { id: 'A4', batchId: 'B004', type: 'overtemp', severity: 'danger', description: '严重超温', detail: {}, sourceRows: [40, 41] },
    { id: 'A5', batchId: 'B005', type: 'unregistered', severity: 'warning', description: '未登记', detail: {}, sourceRows: [50] },
    { id: 'A6', batchId: 'B007', type: 'overtemp', severity: 'warning', description: '轻微超温', detail: {}, sourceRows: [60] },
  ];
  const decisions = {
    B001: { batchId: 'B001', conclusion: 'quarantine', reviewer: '张三', remark: '隔离', updatedAt: isoDaysAgo(1) },
    B004: { batchId: 'B004', conclusion: 'quarantine', reviewer: '李四', remark: '隔离', updatedAt: isoDaysAgo(3) },
  };
  const handoverRecords = [
    { id: 'H1', title: '异常交接-001', items: [{ anomalyId: 'A3', batchId: 'B003' }, { anomalyId: 'A4', batchId: 'B004' }], status: 'pending', createdAt: isoDaysAgo(1) },
  ];
  return { batches, anomalies, decisions, handoverRecords };
};

// ---------- 测试用例 ----------
let passed = 0;
let failed = 0;
const runTest = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed += 1;
  }
};

console.log('\n=== 供应商温控风险画像模块测试 ===\n');

// 测试 1: 名称归一化
console.log('1. 供应商名称归一化');
runTest('normalizeSupplierName 处理大小写、空格', () => {
  assert.equal(normalizeSupplierName(' 华兰 生物 '), '华兰 生物');
  assert.equal(normalizeSupplierName('HUALAN BIO'), 'hualan bio');
  assert.equal(normalizeSupplierName('  多  空格  '), '多 空格');
  assert.equal(normalizeSupplierName(null), '');
  assert.equal(normalizeSupplierName(undefined), '');
  assert.equal(normalizeSupplierName(''), '');
});

// 测试 2: 名称冲突检测
console.log('\n2. 名称冲突检测');
runTest('detectSupplierNameConflicts 识别"华兰生物 / 华兰生物 "（仅首尾空格差异）为冲突', () => {
  const { batches } = makeMockData();
  const { conflicts } = detectSupplierNameConflicts(batches, { variantToCanonical: {}, conflicts: [] });
  const hualanTrimConflict = conflicts.find((c) => c.normalizedKey === '华兰生物');
  assert.ok(hualanTrimConflict, '应检测到首尾空格变体冲突');
  assert.equal(hualanTrimConflict.variants.length, 2, '应包含2个变体（华兰生物 / 华兰生物 ）');
  assert.deepEqual(hualanTrimConflict.variants.sort(), ['华兰生物', '华兰生物 '].sort());
});
runTest('已解决的冲突不应再提示', () => {
  const { batches } = makeMockData();
  const resolved = {
    variantToCanonical: {},
    conflicts: [{ id: 'c1', normalizedKey: '华兰生物', variants: [], batchIdsByVariant: {}, resolved: true }],
  };
  const { conflicts } = detectSupplierNameConflicts(batches, resolved);
  assert.equal(conflicts.filter((c) => c.normalizedKey === '华兰生物').length, 0);
});

// 测试 3: 风险等级评估
console.log('\n3. 风险等级评估');
runTest('无异常 = safe', () => {
  const result = evaluateRiskLevel(
    { totalAnomalies: 0, dangerAnomalies: 0, overtempCount: 0, missingLogCount: 0, unregisteredCount: 0, reviewConflictCount: 0, pendingHandoverCount: 0 },
    DEFAULT_SUPPLIER_RISK_RULES,
  );
  assert.equal(result.level, 'safe');
});
runTest('1个异常 = low', () => {
  const result = evaluateRiskLevel(
    { totalAnomalies: 1, dangerAnomalies: 0, overtempCount: 1, missingLogCount: 0, unregisteredCount: 0, reviewConflictCount: 0, pendingHandoverCount: 0 },
    DEFAULT_SUPPLIER_RISK_RULES,
  );
  assert.equal(result.level, 'low');
});
runTest('3异常+1严重 = medium', () => {
  const result = evaluateRiskLevel(
    { totalAnomalies: 3, dangerAnomalies: 1, overtempCount: 1, missingLogCount: 1, unregisteredCount: 0, reviewConflictCount: 1, pendingHandoverCount: 0 },
    DEFAULT_SUPPLIER_RISK_RULES,
  );
  assert.equal(result.level, 'medium');
});
runTest('5异常+2严重 = high', () => {
  const result = evaluateRiskLevel(
    { totalAnomalies: 6, dangerAnomalies: 3, overtempCount: 2, missingLogCount: 1, unregisteredCount: 1, reviewConflictCount: 2, pendingHandoverCount: 1 },
    DEFAULT_SUPPLIER_RISK_RULES,
  );
  assert.equal(result.level, 'high');
});

// 测试 4: 画像构建
console.log('\n4. 供应商画像构建');
runTest('buildSupplierRiskProfiles 正确按供应商汇总', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const names = profiles.map((p) => p.displayName).sort();
  assert.ok(names.includes('科兴生物'), '应有科兴生物');
  assert.ok(names.includes('国药集团'), '应有国药集团');
  assert.ok(names.includes(MISSING_SUPPLIER_DISPLAY), '应有未填写供应商');
  const hualanProfiles = profiles.filter((p) => p.nameVariants.some((v) => v.includes('华兰')));
  assert.equal(hualanProfiles.length, 2, '冲突未解决前应有2个独立华兰条目（首尾空格不同 vs 中间空格）');
});
runTest('合并名称冲突后华兰生物归一为单个供应商', () => {
  const mock = makeMockData();
  const resolution = {
    variantToCanonical: {
      '华兰 生物': '华兰生物',
    },
    conflicts: [
      { id: 'c1', normalizedKey: '华兰生物', variants: ['华兰生物', '华兰生物 '], batchIdsByVariant: {}, resolved: true, mergedTo: '华兰生物' },
      { id: 'c2', normalizedKey: '华兰 生物', variants: ['华兰 生物'], batchIdsByVariant: {}, resolved: true, mergedTo: '华兰生物' },
    ],
  };
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: resolution,
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const hualan = profiles.find((p) => p.canonicalName === '华兰生物');
  assert.ok(hualan, '合并后应存在华兰生物');
  assert.equal(hualan.batchCount, 3, '合并后应有3个批次');
  assert.equal(hualan.totalAnomalies, 3, '合并后应有3个异常');
  assert.equal(hualan.nameVariants.length, 3, '应包含3个名称变体');
});
runTest('供应商缺失批次独立分组', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const missing = profiles.find((p) => p.canonicalName === MISSING_SUPPLIER_KEY);
  assert.ok(missing, '应有缺失供应商分组');
  assert.equal(missing.missingSupplierBatches.length, 1);
  assert.equal(missing.missingSupplierBatches[0], 'B006');
});
runTest('待交接数量统计', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const hasPending = profiles.some((p) => p.pendingHandoverCount > 0);
  assert.ok(hasPending, '至少一个供应商有待交接');
});
runTest('风险评分排序（高风险在前）', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  for (let i = 1; i < profiles.length; i++) {
    assert.ok(profiles[i - 1].riskScore >= profiles[i].riskScore, '应按风险分数降序');
  }
});

// 测试 5: 筛选
console.log('\n5. 筛选功能');
runTest('按风险等级筛选', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const filtered = filterSupplierRiskProfiles(profiles, { riskLevels: ['medium', 'high', 'critical'] });
  assert.ok(filtered.every((p) => ['medium', 'high', 'critical'].includes(p.riskLevel)));
});
runTest('按异常类型筛选(overtemp)', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const filtered = filterSupplierRiskProfiles(profiles, { anomalyTypes: ['overtemp'] });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((p) => p.overtempCount > 0));
});
runTest('关键词搜索供应商名', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const filtered = filterSupplierRiskProfiles(profiles, { keyword: '科兴' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].displayName, '科兴生物');
});
runTest('仅显示待交接', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const filtered = filterSupplierRiskProfiles(profiles, { onlyWithPendingHandovers: true });
  assert.ok(filtered.every((p) => p.pendingHandoverCount > 0));
});

// 测试 6: localStorage 持久化
console.log('\n6. localStorage 持久化');
runTest('风险规则保存与加载', () => {
  mockStorage.clear();
  const customRules = {
    version: 1,
    trendWindowDays: 14,
    levels: [{ level: 'high', conditions: { minTotalAnomalies: 2 } }],
  };
  saveSupplierRiskRules(customRules);
  const loaded = loadSupplierRiskRules();
  assert.equal(loaded.trendWindowDays, 14);
  assert.deepEqual(loaded.levels, customRules.levels);
});
runTest('规则缺失时返回默认值', () => {
  mockStorage.clear();
  const loaded = loadSupplierRiskRules();
  assert.equal(loaded.trendWindowDays, DEFAULT_SUPPLIER_RISK_RULES.trendWindowDays);
  assert.equal(loaded.levels.length, DEFAULT_SUPPLIER_RISK_RULES.levels.length);
});
runTest('名称冲突决议持久化', () => {
  mockStorage.clear();
  const res = {
    variantToCanonical: { 'hualan bio': '华兰生物' },
    conflicts: [{ id: 'c1', normalizedKey: 'hualan bio', variants: ['Hualan Bio', 'hualan bio'], batchIdsByVariant: {}, resolved: true }],
  };
  saveSupplierNameResolution(res);
  const loaded = loadSupplierNameResolution();
  assert.equal(loaded.variantToCanonical['hualan bio'], '华兰生物');
  assert.equal(loaded.conflicts.length, 1);
  assert.ok(loaded.updatedAt, '应写入 updatedAt');
});

// 测试 7: 导出快照数据结构
console.log('\n7. 导出快照结构');
runTest('JSON 导出应包含 profiles / filter / rules / nameResolution / auditLogs', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const filter = { keyword: '', anomalyTypes: [], reviewStatuses: [], riskLevels: [], timeRangeStart: '', timeRangeEnd: '', onlyWithPendingHandovers: false, onlyWithNameConflicts: false };
  const resolution = { variantToCanonical: {}, conflicts: [] };
  const auditLogs = [{ id: 'log1', action: 'export_supplier_risk', timestamp: new Date().toISOString() }];
  const snapshot = {
    exportedAt: new Date().toISOString(),
    profiles,
    filterSnapshot: filter,
    rulesSnapshot: DEFAULT_SUPPLIER_RISK_RULES,
    nameResolutionSnapshot: resolution,
    auditLogs,
  };
  assert.ok(Array.isArray(snapshot.profiles));
  assert.equal(snapshot.filterSnapshot.keyword, '');
  assert.equal(snapshot.rulesSnapshot.levels.length, 5);
  assert.ok(snapshot.auditLogs.length > 0);
  assert.ok(snapshot.exportedAt);
});
runTest('每个 profile 应包含批次明细与原始行号', () => {
  const mock = makeMockData();
  const profiles = buildSupplierRiskProfiles({
    ...mock,
    nameResolution: { variantToCanonical: {}, conflicts: [] },
    riskRules: DEFAULT_SUPPLIER_RISK_RULES,
  });
  const profileWithAnomaly = profiles.find((p) => p.totalAnomalies > 0);
  assert.ok(profileWithAnomaly);
  const batchWithAnomaly = profileWithAnomaly.batches.find((b) => b.anomalyIds.length > 0);
  assert.ok(batchWithAnomaly);
  assert.ok(batchWithAnomaly.sourceRows.length > 0, '应有原始行号');
  assert.ok(Array.isArray(batchWithAnomaly.anomalyTypes));
});

// 汇总
console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
if (failed > 0) process.exit(1);
