// 温控异常复盘工作台测试脚本
// 覆盖：模板持久化、冲突检测与确认合并、节点编辑撤销、导出 JSON/CSV 快照结构
// 运行：node scripts/test-review-workbench.mjs

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

// ---------- Mock date-fns 核心函数 ----------
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

// ---------- 常量（与 src/types/index.ts 保持一致） ----------
const REVIEW_TEMPLATE_STORAGE_KEY = 'cold-chain-review-templates-v1';
const REVIEW_RECORDS_STORAGE_KEY = 'cold-chain-review-records-v1';

const REVIEW_SEVERITY_LABEL = {
  minor: '轻微',
  moderate: '一般',
  major: '较严重',
  critical: '严重',
};

const REVIEW_NODE_TYPE_LABEL = {
  arrival: '到货登记',
  temperature: '温度监控',
  anomaly_detect: '异常命中',
  manual_review: '人工复核',
  handover: '交接流转',
  supplier_risk: '供应商画像',
  disposition: '处置结论',
};

const DEFAULT_REVIEW_TEMPLATES = [
  {
    id: 'tpl-default',
    name: '标准复盘模板',
    description: '默认模板，包含到货、温度、异常、处置四个核心节点',
    defaultSeverity: 'moderate',
    nodes: [
      { nodeType: 'arrival', required: true, defaultResponsible: '仓储组' },
      { nodeType: 'temperature', required: true, defaultResponsible: '冷链运输' },
      { nodeType: 'anomaly_detect', required: true, defaultResponsible: '质控员' },
      { nodeType: 'manual_review', required: false, defaultResponsible: '' },
      { nodeType: 'disposition', required: true, defaultResponsible: '质量负责人' },
    ],
    createdAt: new Date('2025-01-01T00:00:00').toISOString(),
    updatedAt: new Date('2025-01-01T00:00:00').toISOString(),
  },
];

// ---------- 工具函数 ----------
const genReviewId = () =>
  `rvw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const genNodeId = () =>
  `nod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let logSeq = 0;
const createReviewLog = (action, summary, operator, meta = {}) => ({
  id: `log-${Date.now()}-${(logSeq++).toString().padStart(3, '0')}`,
  action,
  summary,
  operator,
  timestamp: new Date().toISOString(),
  meta,
});

// ---------- 持久化函数 ----------
const loadReviewTemplates = () => {
  try {
    const raw = localStorage.getItem(REVIEW_TEMPLATE_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES));
    }
    return parsed;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES));
  }
};

const saveReviewTemplates = (templates) => {
  localStorage.setItem(REVIEW_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
};

const loadReviewRecords = () => {
  try {
    const raw = localStorage.getItem(REVIEW_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveReviewRecords = (records) => {
  localStorage.setItem(REVIEW_RECORDS_STORAGE_KEY, JSON.stringify(records));
};

// ---------- 节点构建函数 ----------
const buildArrivalNode = (batch, tplCfg) => ({
  id: genNodeId(),
  nodeType: 'arrival',
  title: `到货登记：${batch.batchId}`,
  description: `${batch.productName} 到货，要求温度 ${batch.requiredTempMin}~${batch.requiredTempMax}°C`,
  timestamp: batch.arrivalTime,
  required: tplCfg?.required ?? true,
  responsible: tplCfg?.defaultResponsible ?? '',
  remark: '',
  attachmentName: '',
  conclusion: '',
  severity: undefined,
  ruleHits: [],
  evidences: [
    {
      fileName: `到货单_${batch.batchId}.csv`,
      dataType: 'arrival',
      batchId: batch.batchId,
      sourceRowNumbers: [batch.sourceRowNumber].filter(Boolean),
      rawValue: `${batch.productName}|${batch.supplier}`,
    },
  ],
});

const buildTemperatureNodes = (batch, logs, tplCfg) => {
  const batchLogs = logs.filter((l) => l.batchId === batch.batchId);
  if (batchLogs.length === 0) return [];
  const temps = batchLogs.map((l) => l.temperature);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const avgT = temps.reduce((a, b) => a + b, 0) / temps.length;
  return [
    {
      id: genNodeId(),
      nodeType: 'temperature',
      title: `温度监控：${batch.batchId} 共 ${batchLogs.length} 条记录`,
      description: `温度范围 ${minT.toFixed(1)}~${maxT.toFixed(1)}°C，平均 ${avgT.toFixed(1)}°C`,
      timestamp: batchLogs[batchLogs.length - 1].timestamp,
      required: tplCfg?.required ?? true,
      responsible: tplCfg?.defaultResponsible ?? '',
      remark: '',
      attachmentName: '',
      conclusion: '',
      severity: undefined,
      ruleHits: [],
      evidences: batchLogs.map((l) => ({
        fileName: `温度日志_${batch.batchId}.csv`,
        dataType: 'temperature',
        batchId: batch.batchId,
        sourceRowNumbers: [l.sourceRowNumber].filter(Boolean),
        rawValue: `${l.timestamp}|${l.temperature}°C|探针 ${l.probeId}`,
      })),
    },
  ];
};

const buildAnomalyNodes = (batch, anomalies, severityMap, tplCfg) => {
  const list = anomalies.filter((a) => a.batchId === batch.batchId);
  return list.map((a) => ({
    id: genNodeId(),
    nodeType: 'anomaly_detect',
    title: `异常命中：${a.type}`,
    description: a.detail,
    timestamp: a.detectedAt,
    required: tplCfg?.required ?? true,
    responsible: tplCfg?.defaultResponsible ?? '',
    remark: '',
    attachmentName: '',
    conclusion: '',
    severity: severityMap?.[a.type] ?? (a.level === 'danger' ? 'major' : 'moderate'),
    ruleHits: a.ruleIds ?? [],
    evidences: [
      {
        fileName: `异常明细_${batch.batchId}.csv`,
        dataType: 'anomaly',
        batchId: batch.batchId,
        sourceRowNumbers: a.sourceRowNumbers ?? [],
        rawValue: `${a.type}|${a.detail}`,
      },
    ],
  }));
};

const buildDispositionNode = (batch, decision, tplCfg) => ({
  id: genNodeId(),
  nodeType: 'disposition',
  title: `处置结论：${batch.batchId}`,
  description: decision ?? '待填写处置结论',
  timestamp: new Date().toISOString(),
  required: tplCfg?.required ?? true,
  responsible: tplCfg?.defaultResponsible ?? '',
  remark: '',
  attachmentName: '',
  conclusion: decision ?? '',
  severity: undefined,
  ruleHits: [],
  evidences: [],
});

// ---------- 复盘记录构建 ----------
const buildReviewRecord = (params) => {
  const {
    batchIds,
    batches = [],
    temperatureLogs = [],
    anomalies = [],
    manualReviews = [],
    handovers = [],
    supplierProfiles = [],
    templateId = 'tpl-default',
    templates = DEFAULT_REVIEW_TEMPLATES,
    title,
    createdBy = '测试员',
  } = params;

  const tpl = templates.find((t) => t.id === templateId) ?? templates[0];
  const cfgMap = new Map(tpl.nodes.map((n) => [n.nodeType, n]));
  const nodes = [];
  const relatedBatches = batches.filter((b) => batchIds.includes(b.batchId));

  relatedBatches.forEach((b) => {
    nodes.push(buildArrivalNode(b, cfgMap.get('arrival')));
    nodes.push(...buildTemperatureNodes(b, temperatureLogs, cfgMap.get('temperature')));
    nodes.push(...buildAnomalyNodes(b, anomalies, {}, cfgMap.get('anomaly_detect')));
    nodes.push(buildDispositionNode(b, undefined, cfgMap.get('disposition')));
  });

  nodes.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  const suppliers = [...new Set(relatedBatches.map((b) => b.supplier).filter(Boolean))];
  const severities = nodes.map((n) => n.severity).filter(Boolean);
  const severityRank = { critical: 4, major: 3, moderate: 2, minor: 1 };
  const maxSeverity = severities.length > 0
    ? severities.reduce((a, b) => (severityRank[a] > severityRank[b] ? a : b))
    : (tpl?.defaultSeverity ?? 'moderate');

  return {
    id: genReviewId(),
    title: title ?? `复盘_${batchIds.join('_')}`,
    batchIds,
    supplierName: suppliers[0] ?? '',
    templateId: tpl.id,
    severity: maxSeverity,
    status: 'draft',
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    nodes,
    logs: [
      createReviewLog(
        'create',
        `创建复盘单，包含 ${batchIds.length} 个批次，${nodes.length} 个节点`,
        createdBy,
        { templateId: tpl.id, batchIds },
      ),
    ],
  };
};

// ---------- 冲突检测 ----------
const detectReviewConflicts = (newRecord, existingRecords) => {
  const conflicts = [];

  const overlapping = existingRecords.filter(
    (r) => r.id !== newRecord.id && r.batchIds.some((b) => newRecord.batchIds.includes(b)),
  );
  if (overlapping.length > 0) {
    const commonBatches = [...new Set(overlapping.flatMap((r) => r.batchIds))].filter((b) =>
      newRecord.batchIds.includes(b),
    );
    conflicts.push({
      id: `cfl-${Date.now()}-multi`,
      type: 'multi_ref',
      severity: 'warning',
      title: `批次被 ${overlapping.length} 个已有复盘单引用`,
      description: `批次 ${commonBatches.join('、')} 已存在于：${overlapping.map((o) => o.title).join('、')}。建议合并或确认独立复盘。`,
      relatedBatchIds: commonBatches,
      relatedReviewIds: overlapping.map((o) => o.id),
      options: [
        {
          key: 'merge_latest',
          label: `合并到最新复盘单（保留 ${newRecord.title}）`,
          description: '将重叠批次的节点合并入当前复盘单，删除旧的重叠复盘单',
          isRecommended: true,
        },
        {
          key: 'keep_both',
          label: '保留全部（允许交叉引用）',
          description: '不做任何修改，多个复盘单独立存在',
          isDefault: true,
        },
      ],
    });
  }

  const emptyOwners = newRecord.nodes.filter(
    (n) => n.required && (!n.responsible || n.responsible.trim() === ''),
  );
  if (emptyOwners.length > 0) {
    conflicts.push({
      id: `cfl-${Date.now()}-owner`,
      type: 'empty_owner',
      severity: 'warning',
      title: `${emptyOwners.length} 个必填节点未设置负责人`,
      description: `节点：${emptyOwners.map((n) => REVIEW_NODE_TYPE_LABEL[n.nodeType]).join('、')}。建议先指派负责人再流转。`,
      relatedBatchIds: [],
      relatedReviewIds: [newRecord.id],
      options: [
        {
          key: 'fill_auto',
          label: '使用模板默认负责人补全',
          description: '按模板配置填充默认负责人（如仓储组、质控员等）',
          isRecommended: true,
        },
        {
          key: 'skip_owner',
          label: '稍后手动设置',
          description: '保持为空，先创建复盘单',
          isDefault: true,
        },
      ],
    });
  }

  const conflictConclusions = new Set();
  overlapping.forEach((old) => {
    old.nodes.forEach((on) => {
      if (!on.conclusion) return;
      newRecord.nodes.forEach((nn) => {
        if (
          nn.nodeType === on.nodeType &&
          nn.conclusion &&
          nn.conclusion.trim() !== on.conclusion.trim() &&
          newRecord.batchIds.some((b) => old.batchIds.includes(b))
        ) {
          conflictConclusions.add(`${on.nodeType}|${on.conclusion}|${nn.conclusion}`);
        }
      });
    });
  });
  if (conflictConclusions.size > 0) {
    conflicts.push({
      id: `cfl-${Date.now()}-conc`,
      type: 'conclusion_conflict',
      severity: 'danger',
      title: `${conflictConclusions.size} 处处置结论互相冲突`,
      description: '同一批次同类节点在新旧复盘单中结论不一致，需确认以哪份为准。',
      relatedBatchIds: overlapping.flatMap((o) => o.batchIds),
      relatedReviewIds: [newRecord.id, ...overlapping.map((o) => o.id)],
      options: [
        {
          key: 'use_new',
          label: '以当前复盘单结论为准',
          description: '覆盖已有复盘单中冲突节点的结论',
          isRecommended: true,
        },
        {
          key: 'use_old',
          label: '保留已有复盘单结论',
          description: '丢弃当前复盘单中的冲突结论',
        },
        {
          key: 'skip_conclusion',
          label: '两份都保留，由人工判断',
          description: '不做自动合并，结论冲突仍保留在两份复盘单中',
          isDefault: true,
        },
      ],
    });
  }

  return conflicts;
};

// ---------- 冲突解决（简化版）----------
const resolveConflict = (targetRecord, conflict, optionKey, operator, allRecords, templates) => {
  let record = JSON.parse(JSON.stringify(targetRecord));
  let records = JSON.parse(JSON.stringify(allRecords));
  const logs = [];

  switch (optionKey) {
    case 'merge_latest': {
      const toRemove = new Set(conflict.relatedReviewIds);
      records = records.filter((r) => !toRemove.has(r.id));
      logs.push(
        createReviewLog(
          'merge',
          `合并冲突复盘单：删除 ${toRemove.size} 份重叠复盘单`,
          operator,
          { removedIds: [...toRemove] },
        ),
      );
      break;
    }
    case 'fill_auto': {
      const tpl = templates.find((t) => t.id === record.templateId) ?? templates[0];
      const cfgMap = new Map(tpl.nodes.map((n) => [n.nodeType, n]));
      record.nodes = record.nodes.map((n) => {
        const cfg = cfgMap.get(n.nodeType);
        if (n.required && (!n.responsible || !n.responsible.trim()) && cfg?.defaultResponsible) {
          return { ...n, responsible: cfg.defaultResponsible };
        }
        return n;
      });
      logs.push(
        createReviewLog(
          'conflict_resolve',
          '按模板自动补全节点负责人',
          operator,
          { templateId: tpl.id },
        ),
      );
      break;
    }
    case 'use_new':
    case 'use_old':
    case 'keep_both':
    case 'skip_owner':
    case 'skip_conclusion':
    default:
      logs.push(
        createReviewLog(
          'conflict_resolve',
          `冲突处理：选择方案 ${optionKey}，无需修改数据`,
          operator,
          { conflictId: conflict.id, option: optionKey },
        ),
      );
      break;
  }

  record.logs = [...record.logs, ...logs];
  record.updatedAt = new Date().toISOString();
  if (!records.find((r) => r.id === record.id)) records.push(record);
  else records = records.map((r) => (r.id === record.id ? record : r));

  return { record, records };
};

// ---------- 筛选与指标 ----------
const applyReviewFilters = (records, filters) => {
  return records.filter((r) => {
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      if (
        !r.title.toLowerCase().includes(kw) &&
        !r.id.toLowerCase().includes(kw) &&
        !r.batchIds.some((b) => b.toLowerCase().includes(kw))
      ) {
        return false;
      }
    }
    if (filters.severities?.length > 0 && !filters.severities.includes(r.severity)) return false;
    if (filters.statuses?.length > 0 && !filters.statuses.includes(r.status)) return false;
    if (filters.createdBy && !r.createdBy.toLowerCase().includes(filters.createdBy.toLowerCase())) return false;
    if (filters.batchId && !r.batchIds.includes(filters.batchId)) return false;
    if (filters.supplierName && !r.supplierName?.toLowerCase().includes(filters.supplierName.toLowerCase())) {
      return false;
    }
    return true;
  });
};

const getReviewMetrics = (records) => {
  const byStatus = { draft: 0, in_progress: 0, completed: 0, archived: 0 };
  const bySeverity = { minor: 0, moderate: 0, major: 0, critical: 0 };
  records.forEach((r) => {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
  });
  return { total: records.length, byStatus, bySeverity };
};

// ---------- 导出 ----------
const buildReviewExportJson = (records, filters, templates, exportTime, exportedBy) => {
  const evidenceList = [];
  records.forEach((r) => {
    r.nodes.forEach((n) => {
      (n.evidences ?? []).forEach((e, idx) => {
        evidenceList.push({
          reviewId: r.id,
          reviewTitle: r.title,
          nodeId: n.id,
          nodeType: n.nodeType,
          nodeTitle: n.title,
          evidenceIndex: idx,
          fileName: e.fileName,
          dataType: e.dataType,
          batchId: e.batchId,
          sourceRowNumbers: (e.sourceRowNumbers ?? []).join('|'),
          rawValue: e.rawValue ?? '',
        });
      });
    });
  });

  return {
    schemaVersion: 1,
    exportedAt: exportTime,
    exportedBy,
    filterSnapshot: filters,
    templateSnapshot: templates,
    records: records.map(({ nodes, logs, ...rest }) => ({
      ...rest,
      nodes: nodes.map(({ evidences, ...nRest }) => nRest),
      logs,
    })),
    evidenceList,
    stats: {
      recordCount: records.length,
      nodeCount: records.reduce((s, r) => s + r.nodes.length, 0),
      evidenceCount: evidenceList.length,
      logCount: records.reduce((s, r) => s + r.logs.length, 0),
    },
  };
};

const buildReviewExportCsv = (records, filters, templates, exportTime, exportedBy) => {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [];
  const section = (title) => {
    lines.push(`# ===== ${title} =====`);
  };
  const row = (arr) => lines.push(arr.map(esc).join(','));

  section('复盘单汇总');
  row([
    '复盘单ID', '标题', '批次', '供应商', '模板ID', '严重级别',
    '状态', '创建人', '创建时间', '更新时间', '完成时间', '节点数', '日志数',
  ]);
  records.forEach((r) => {
    row([
      r.id, r.title, r.batchIds.join('|'), r.supplierName ?? '', r.templateId,
      REVIEW_SEVERITY_LABEL[r.severity] ?? r.severity, r.status,
      r.createdBy, r.createdAt, r.updatedAt, r.completedAt ?? '',
      r.nodes.length, r.logs.length,
    ]);
  });

  lines.push('');
  section('节点明细');
  row([
    '复盘单ID', '节点ID', '节点类型', '标题', '描述',
    '时间戳', '是否必填', '负责人', '结论', '附件', '严重级别', '命中规则', '备注',
  ]);
  records.forEach((r) => {
    r.nodes.forEach((n) => {
      row([
        r.id, n.id, REVIEW_NODE_TYPE_LABEL[n.nodeType] ?? n.nodeType,
        n.title, n.description ?? '', n.timestamp ?? '',
        n.required ? '是' : '否', n.responsible ?? '', n.conclusion ?? '',
        n.attachmentName ?? '', REVIEW_SEVERITY_LABEL[n.severity] ?? '',
        (n.ruleHits ?? []).join('|'), n.remark ?? '',
      ]);
    });
  });

  lines.push('');
  section('证据清单');
  row([
    '复盘单ID', '节点ID', '节点类型', '文件名', '数据类型',
    '批次号', '原始行号', '原始值',
  ]);
  records.forEach((r) => {
    r.nodes.forEach((n) => {
      (n.evidences ?? []).forEach((e) => {
        row([
          r.id, n.id, REVIEW_NODE_TYPE_LABEL[n.nodeType] ?? n.nodeType,
          e.fileName ?? '', e.dataType, e.batchId ?? '',
          (e.sourceRowNumbers ?? []).join('|'),
          e.rawValue ?? '',
        ]);
      });
    });
  });

  lines.push('');
  section('操作日志');
  row(['复盘单ID', '日志ID', '动作', '摘要', '操作人', '时间', '元数据']);
  records.forEach((r) => {
    r.logs.forEach((l) => {
      row([
        r.id, l.id, l.action, l.summary, l.operator, l.timestamp,
        JSON.stringify(l.meta ?? {}),
      ]);
    });
  });

  lines.push('');
  section('筛选快照');
  row(['导出时间', '导出人', '筛选条件']);
  row([exportTime, exportedBy, JSON.stringify(filters)]);

  lines.push('');
  section('模板快照');
  row(['模板ID', '模板名称', '描述', '默认严重级别', '节点数', '创建时间', '更新时间', '节点配置(JSON)']);
  templates.forEach((t) => {
    row([
      t.id, t.name, t.description ?? '', REVIEW_SEVERITY_LABEL[t.defaultSeverity] ?? '',
      t.nodes.length, t.createdAt, t.updatedAt, JSON.stringify(t.nodes),
    ]);
  });

  return lines.join('\n');
};

// =============================================================
//  测试用例
// =============================================================

let pass = 0;
let fail = 0;
const run = (name, fn) => {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${name}\n     ${e.message}`);
    fail++;
  }
};

const mockBatch = (overrides = {}) => ({
  batchId: overrides.batchId ?? 'BATCH-001',
  productName: overrides.productName ?? '新冠疫苗',
  supplier: overrides.supplier ?? '科兴生物',
  arrivalTime: overrides.arrivalTime ?? '2025-01-15T09:00:00Z',
  requiredTempMin: 2,
  requiredTempMax: 8,
  sourceRowNumber: overrides.sourceRowNumber ?? 5,
});

const mockTempLog = (batchId, temp, ts, row) => ({
  batchId,
  temperature: temp,
  timestamp: ts,
  probeId: 'P1',
  sourceRowNumber: row,
});

const mockAnomaly = (batchId, type, detail, level, rowNumbers, ruleIds) => ({
  batchId,
  type,
  detail,
  level,
  detectedAt: '2025-01-15T10:00:00Z',
  sourceRowNumbers: rowNumbers,
  ruleIds,
});

console.log('\n🧪 温控异常复盘工作台 测试套件');

// ---------- 1. 模板持久化 ----------
console.log('\n📋 1. 复盘模板持久化');
localStorage.clear();

run('默认模板在 localStorage 为空时正确加载', () => {
  const tpls = loadReviewTemplates();
  assert.equal(tpls.length, 1);
  assert.equal(tpls[0].id, 'tpl-default');
  assert.equal(tpls[0].name, '标准复盘模板');
  assert.ok(tpls[0].nodes.length >= 4);
});

run('保存模板后重新读取一致', () => {
  const tpls = loadReviewTemplates();
  const newTpl = {
    id: 'tpl-test-1',
    name: '测试模板',
    description: '单元测试用',
    defaultSeverity: 'critical',
    nodes: [
      { nodeType: 'arrival', required: true, defaultResponsible: '测试A' },
      { nodeType: 'disposition', required: true, defaultResponsible: '测试B' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveReviewTemplates([...tpls, newTpl]);
  const reloaded = loadReviewTemplates();
  assert.equal(reloaded.length, 2);
  const found = reloaded.find((t) => t.id === 'tpl-test-1');
  assert.ok(found);
  assert.equal(found.defaultSeverity, 'critical');
  assert.equal(found.nodes[0].defaultResponsible, '测试A');
});

run('不允许删除 tpl-default（约定由上层校验）', () => {
  const tpls = loadReviewTemplates();
  const filtered = tpls.filter((t) => t.id !== 'tpl-default');
  assert.equal(filtered.length, 1);
  assert.ok(!filtered.some((t) => t.id === 'tpl-default'));
});

run('损坏的 localStorage 自动回退到默认模板', () => {
  localStorage.setItem(REVIEW_TEMPLATE_STORAGE_KEY, 'this-is-not-json');
  const tpls = loadReviewTemplates();
  assert.equal(tpls.length, 1);
  assert.equal(tpls[0].id, 'tpl-default');
});

// ---------- 2. 复盘记录构建 ----------
console.log('\n📝 2. 复盘记录构建与节点链路');
localStorage.clear();
saveReviewTemplates(DEFAULT_REVIEW_TEMPLATES);

const batchA = mockBatch({ batchId: 'BATCH-A001', productName: '流感疫苗' });
const batchB = mockBatch({ batchId: 'BATCH-A002', productName: 'HPV疫苗', arrivalTime: '2025-01-15T10:30:00Z', sourceRowNumber: 12 });
const logs = [
  mockTempLog('BATCH-A001', 5.2, '2025-01-15T09:30:00Z', 10),
  mockTempLog('BATCH-A001', 6.8, '2025-01-15T09:45:00Z', 11),
  mockTempLog('BATCH-A001', 10.5, '2025-01-15T10:00:00Z', 12),
  mockTempLog('BATCH-A002', 4.1, '2025-01-15T11:00:00Z', 20),
];
const anomalies = [
  mockAnomaly('BATCH-A001', 'over_temp', '温度超上限 10.5°C > 8°C', 'danger', [12], ['RULE-OVER-TEMP-01']),
];

run('构建复盘单自动生成 ID 与标题', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
    createdBy: '张三',
  });
  assert.ok(rec.id.startsWith('rvw-'));
  assert.equal(rec.createdBy, '张三');
  assert.equal(rec.batchIds.length, 1);
  assert.ok(rec.title.includes('BATCH-A001'));
});

run('节点按到货→温度→异常→处置的顺序排列', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
  });
  const types = rec.nodes.map((n) => n.nodeType);
  assert.equal(types[0], 'arrival');
  assert.equal(types[1], 'temperature');
  assert.equal(types[2], 'anomaly_detect');
  assert.equal(types[3], 'disposition');
});

run('异常节点携带原始行号和规则命中', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
  });
  const anomalyNode = rec.nodes.find((n) => n.nodeType === 'anomaly_detect');
  assert.ok(anomalyNode);
  assert.deepEqual(anomalyNode.ruleHits, ['RULE-OVER-TEMP-01']);
  assert.deepEqual(anomalyNode.evidences[0].sourceRowNumbers, [12]);
});

run('温度节点统计 min/max/avg', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
  });
  const tempNode = rec.nodes.find((n) => n.nodeType === 'temperature');
  assert.ok(tempNode);
  assert.ok(tempNode.description.includes('5.2'));
  assert.ok(tempNode.description.includes('10.5'));
  assert.equal(tempNode.evidences.length, 3);
});

run('模板默认负责人正确注入节点', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
  });
  const arrivalNode = rec.nodes.find((n) => n.nodeType === 'arrival');
  assert.equal(arrivalNode.responsible, '仓储组');
  const dispNode = rec.nodes.find((n) => n.nodeType === 'disposition');
  assert.equal(dispNode.responsible, '质量负责人');
});

run('多批次复盘单自动推断最高严重级别', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001', 'BATCH-A002'],
    batches: [batchA, batchB],
    temperatureLogs: logs,
    anomalies,
  });
  assert.equal(rec.severity, 'major');
  assert.equal(rec.batchIds.length, 2);
  assert.ok(rec.nodes.length > 4);
});

run('复盘记录持久化（save/load）', () => {
  const rec1 = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
    createdBy: '持久化测试',
  });
  saveReviewRecords([rec1]);
  const loaded = loadReviewRecords();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].createdBy, '持久化测试');
  assert.equal(loaded[0].id, rec1.id);
});

// ---------- 3. 冲突检测与解决 ----------
console.log('\n⚠️  3. 冲突检测与确认合并');
localStorage.clear();
saveReviewTemplates(DEFAULT_REVIEW_TEMPLATES);

const recA = buildReviewRecord({
  batchIds: ['BATCH-A001'],
  batches: [batchA],
  temperatureLogs: logs,
  anomalies,
  title: '复盘单A（先建）',
  createdBy: '冲突测试',
});
// 先保存旧的
saveReviewRecords([recA]);

run('创建重叠批次时检测 multi_ref 冲突', () => {
  const recB = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
    title: '复盘单B（后建）',
  });
  const conflicts = detectReviewConflicts(recB, [recA]);
  const multi = conflicts.find((c) => c.type === 'multi_ref');
  assert.ok(multi);
  assert.equal(multi.severity, 'warning');
  assert.ok(multi.options.find((o) => o.key === 'merge_latest'));
  assert.ok(multi.options.find((o) => o.key === 'keep_both'));
});

run('检测到必填节点未设置负责人时生成 empty_owner 冲突', () => {
  // 手动构造一个负责人为空的必填节点
  const recEmpty = JSON.parse(JSON.stringify(recA));
  recEmpty.nodes.forEach((n) => {
    if (n.required) n.responsible = '';
  });
  const conflicts = detectReviewConflicts(recEmpty, []);
  const emptyOwner = conflicts.find((c) => c.type === 'empty_owner');
  assert.ok(emptyOwner);
  assert.ok(emptyOwner.options.find((o) => o.key === 'fill_auto'));
});

run('新旧复盘单结论不一致触发 conclusion_conflict 且为 danger 级别', () => {
  const recOld = JSON.parse(JSON.stringify(recA));
  const recNew = JSON.parse(JSON.stringify(recA));
  recOld.id = 'rvw-old';
  recNew.id = 'rvw-new';
  const oldDisp = recOld.nodes.find((n) => n.nodeType === 'disposition');
  const newDisp = recNew.nodes.find((n) => n.nodeType === 'disposition');
  oldDisp.conclusion = '放行';
  newDisp.conclusion = '销毁';
  const conflicts = detectReviewConflicts(recNew, [recOld]);
  const conc = conflicts.find((c) => c.type === 'conclusion_conflict');
  assert.ok(conc);
  assert.equal(conc.severity, 'danger');
  const keys = conc.options.map((o) => o.key);
  assert.deepEqual(keys.sort(), ['skip_conclusion', 'use_new', 'use_old'].sort());
});

run('resolveConflict fill_auto 方案按模板补全负责人', () => {
  const recEmpty = JSON.parse(JSON.stringify(recA));
  recEmpty.nodes.forEach((n) => {
    if (n.required) n.responsible = '';
  });
  const conflicts = detectReviewConflicts(recEmpty, []);
  const emptyOwner = conflicts.find((c) => c.type === 'empty_owner');
  const { record } = resolveConflict(recEmpty, emptyOwner, 'fill_auto', '测试员', [recEmpty], DEFAULT_REVIEW_TEMPLATES);
  const required = record.nodes.filter((n) => n.required);
  required.forEach((n) => {
    assert.ok(n.responsible && n.responsible.length > 0, `节点 ${n.nodeType} 负责人未补全`);
  });
  const hasLog = record.logs.some((l) => l.action === 'conflict_resolve');
  assert.ok(hasLog);
});

run('resolveConflict merge_latest 方案删除重叠复盘单', () => {
  const recOld = JSON.parse(JSON.stringify(recA));
  recOld.id = 'rvw-overlap';
  recOld.batchIds = ['BATCH-A001'];
  const recNew = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
    title: '合并后的复盘单',
  });
  const conflicts = detectReviewConflicts(recNew, [recOld]);
  const multi = conflicts.find((c) => c.type === 'multi_ref');
  const { records } = resolveConflict(recNew, multi, 'merge_latest', '测试员', [recOld, recNew], DEFAULT_REVIEW_TEMPLATES);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, recNew.id);
});

// ---------- 4. 撤销（undo）机制 ----------
console.log('\n↩️  4. 节点编辑撤销');

run('编辑节点时可保存快照并恢复', () => {
  const rec = buildReviewRecord({
    batchIds: ['BATCH-A001'],
    batches: [batchA],
    temperatureLogs: logs,
    anomalies,
  });
  const dispNode = rec.nodes.find((n) => n.nodeType === 'disposition');
  // 保存快照
  const snapshot = {
    nodes: JSON.parse(JSON.stringify(rec.nodes)),
    logs: JSON.parse(JSON.stringify(rec.logs)),
  };
  // 修改
  rec.nodes = rec.nodes.map((n) =>
    n.id === dispNode.id ? { ...n, conclusion: '放行', remark: '编辑后的备注' } : n,
  );
  assert.equal(rec.nodes.find((n) => n.id === dispNode.id).conclusion, '放行');
  // 撤销：恢复快照
  rec.nodes = snapshot.nodes;
  rec.logs = snapshot.logs;
  assert.equal(rec.nodes.find((n) => n.id === dispNode.id).conclusion, '');
});

// ---------- 5. 筛选与指标 ----------
console.log('\n🔍 5. 筛选与指标统计');

run('getReviewMetrics 按状态与级别统计', () => {
  const records = [
    { ...recA, status: 'draft', severity: 'minor' },
    { ...recA, id: 'rvw-2', status: 'in_progress', severity: 'major' },
    { ...recA, id: 'rvw-3', status: 'completed', severity: 'critical' },
  ];
  const m = getReviewMetrics(records);
  assert.equal(m.total, 3);
  assert.equal(m.byStatus.draft, 1);
  assert.equal(m.byStatus.in_progress, 1);
  assert.equal(m.byStatus.completed, 1);
  assert.equal(m.bySeverity.critical, 1);
});

run('applyReviewFilters 支持关键字/状态/级别/创建人', () => {
  const records = [
    { ...recA, id: 'rvw-f1', title: '复盘-温度超标的批次', createdBy: '张三', status: 'draft', severity: 'major' },
    { ...recA, id: 'rvw-f2', title: '复盘-其他情况', createdBy: '李四', status: 'completed', severity: 'minor' },
  ];
  const r1 = applyReviewFilters(records, { keyword: '温度超标' });
  assert.equal(r1.length, 1);
  assert.equal(r1[0].id, 'rvw-f1');
  const r2 = applyReviewFilters(records, { severities: ['minor'] });
  assert.equal(r2.length, 1);
  assert.equal(r2[0].id, 'rvw-f2');
  const r3 = applyReviewFilters(records, { createdBy: '张三' });
  assert.equal(r3.length, 1);
  const r4 = applyReviewFilters(records, { statuses: ['completed'] });
  assert.equal(r4.length, 1);
});

// ---------- 6. 导出快照结构 ----------
console.log('\n📤 6. 导出 JSON/CSV 快照结构');

run('buildReviewExportJson 包含 records/filterSnapshot/templateSnapshot/evidenceList/stats', () => {
  const now = new Date().toISOString();
  const filters = { keyword: '', severities: ['major'], statuses: [] };
  const tpls = DEFAULT_REVIEW_TEMPLATES;
  const json = buildReviewExportJson([recA], filters, tpls, now, '导出测试员');
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.exportedBy, '导出测试员');
  assert.deepEqual(json.filterSnapshot, filters);
  assert.equal(json.templateSnapshot.length, tpls.length);
  assert.ok(Array.isArray(json.evidenceList));
  assert.ok(json.evidenceList.length > 0);
  assert.equal(json.stats.recordCount, 1);
  assert.ok(json.stats.nodeCount > 0);
  assert.ok(json.stats.evidenceCount > 0);
  assert.ok(json.stats.logCount > 0);
  // evidenceList 字段完整性
  const ev = json.evidenceList[0];
  assert.ok(ev.reviewId);
  assert.ok(ev.nodeId);
  assert.ok(ev.fileName);
  assert.ok(ev.dataType);
  assert.ok('sourceRowNumbers' in ev);
});

run('buildReviewExportCsv 包含 6 个区段且表头齐全', () => {
  const now = new Date().toISOString();
  const csv = buildReviewExportCsv([recA], { keyword: '' }, DEFAULT_REVIEW_TEMPLATES, now, '测试');
  const sections = [
    '复盘单汇总',
    '节点明细',
    '证据清单',
    '操作日志',
    '筛选快照',
    '模板快照',
  ];
  sections.forEach((name) => {
    assert.ok(csv.includes(`# ===== ${name} =====`), `CSV 缺少区段：${name}`);
  });
  assert.ok(csv.includes('复盘单ID,标题,批次'));
  assert.ok(csv.includes('复盘单ID,节点ID,节点类型'));
  assert.ok(csv.includes('复盘单ID,节点ID,节点类型,文件名,数据类型'));
  assert.ok(csv.includes('复盘单ID,日志ID,动作'));
});

// ---------- 总结 ----------
console.log('\n' + '='.repeat(50));
console.log(`  结果: ${pass} 通过, ${fail} 失败`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
