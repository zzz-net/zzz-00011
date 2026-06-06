import { parseISO } from 'date-fns';
import Papa from 'papaparse';
import type {
  Anomaly,
  ArrivalBatch,
  HandoverRecord,
  ManualReviewRecord,
  ReviewConclusion,
  ReviewConflict,
  ReviewFilterState,
  ReviewLogAction,
  ReviewLogEntry,
  ReviewNode,
  ReviewNodeType,
  ReviewRecord,
  ReviewSeverityLevel,
  ReviewStatus,
  ReviewTemplate,
  ReviewTemplateNodeConfig,
  SupplierRiskProfile,
  TemperatureLog,
} from '@/types';
import {
  DEFAULT_REVIEW_TEMPLATES,
  INITIAL_REVIEW_FILTER,
  REVIEW_NODE_TYPE_LABEL,
  REVIEW_TEMPLATE_STORAGE_KEY,
  REVIEW_RECORDS_STORAGE_KEY,
} from '@/types';

function genReviewId(): string {
  return `RV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function genNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function genLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function genConflictId(): string {
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createReviewLog(
  action: ReviewLogAction,
  operator: string,
  details: string,
  metadata?: Record<string, unknown>,
): ReviewLogEntry {
  return {
    id: genLogId(),
    action,
    operator: operator || '系统',
    timestamp: new Date().toISOString(),
    details,
    metadata,
  };
}

export function loadReviewTemplates(): ReviewTemplate[] {
  try {
    if (typeof localStorage === 'undefined') return JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES));
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
}

export function saveReviewTemplates(templates: ReviewTemplate[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REVIEW_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    /* localStorage unavailable, swallow */
  }
}

export function loadReviewRecords(): ReviewRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(REVIEW_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveReviewRecords(records: ReviewRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REVIEW_RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* localStorage unavailable, swallow */
  }
}

export function buildArrivalNode(
  batch: ArrivalBatch,
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode {
  const now = new Date().toISOString();
  return {
    id: genNodeId(),
    nodeType: 'arrival',
    title: `${batch.productName} 到货登记`,
    timestamp: batch.arrivalTime,
    description: `批次 ${batch.batchId} 到货，要求温度 ${batch.requiredTempMin}~${batch.requiredTempMax}°C${batch.supplier ? `，供应商：${batch.supplier}` : ''}${batch.quantity ? `，数量：${batch.quantity}` : ''}`,
    responsible: tplCfg?.defaultResponsible,
    ruleHits: [],
    evidences: [
      {
        description: '到货清单原始行',
        sourceFile: batch.sourceFile,
        sourceRows: [batch.sourceRow],
        rawData: { batchId: batch.batchId, productName: batch.productName, supplier: batch.supplier },
      },
    ],
    attachmentNames: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTemperatureNodes(
  batch: ArrivalBatch,
  logs: TemperatureLog[],
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode[] {
  const batchLogs = logs
    .filter((l) => l.batchId === batch.batchId && l.isValid)
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

  if (batchLogs.length === 0) return [];

  const now = new Date().toISOString();
  const temps = batchLogs.map((l) => l.temperature);
  const maxT = Math.max(...temps);
  const minT = Math.min(...temps);
  const avgT = temps.reduce((s, v) => s + v, 0) / temps.length;
  const rows = batchLogs.map((l) => l.sourceRow);
  const files = Array.from(new Set(batchLogs.map((l) => l.sourceFile)));

  return [
    {
           id: genNodeId(),
      nodeType: 'temperature',
      title: `温度监控（${batchLogs.length} 条记录）`,
      timestamp: batchLogs[batchLogs.length - 1].timestamp,
      description: `温度范围 ${minT.toFixed(1)}~${maxT.toFixed(1)}°C，平均 ${avgT.toFixed(1)}°C，要求 ${batch.requiredTempMin}~${batch.requiredTempMax}°C`,
      responsible: tplCfg?.defaultResponsible,
      ruleHits: [],
      evidences: [
        {
          description: `温度日志原始行（${rows.length} 行）`,
          sourceFile: files.join(', '),
          sourceRows: rows,
          rawData: { minTemp: minT, maxTemp: maxT, avgTemp: avgT, logCount: batchLogs.length },
        },
      ],
      attachmentNames: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function buildAnomalyNodes(
  batch: ArrivalBatch,
  anomalies: Anomaly[],
  severityMap: Record<Anomaly['severity'], ReviewSeverityLevel> = { warning: 'moderate', danger: 'major' },
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode[] {
  const batchAnomalies = anomalies.filter((a) => a.batchId === batch.batchId);
  if (batchAnomalies.length === 0) return [];

  const now = new Date().toISOString();
  return batchAnomalies.map((a) => ({
    id: genNodeId(),
    nodeType: 'anomaly_detect' as ReviewNodeType,
    title: `异常命中：${a.type}`,
    timestamp: batch.arrivalTime,
    description: a.description,
    severity: severityMap[a.severity],
    responsible: tplCfg?.defaultResponsible,
    ruleHits: [a.type],
    evidences: [
      {
        description: `异常原始行（${a.sourceRows.length} 行）`,
        sourceRows: a.sourceRows,
        rawData: { anomalyType: a.type, anomalyId: a.id, detail: a.detail },
      },
    ],
    attachmentNames: [],
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildManualReviewNodes(
  batch: ArrivalBatch,
  reviews: ManualReviewRecord[],
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode[] {
  const batchReviews = reviews
    .filter((r) => r.batchId === batch.batchId)
    .sort((a, b) => parseISO(a.reviewTime).getTime() - parseISO(b.reviewTime).getTime());

  if (batchReviews.length === 0) return [];

  const now = new Date().toISOString();
  return batchReviews.map((r) => ({
    id: genNodeId(),
    nodeType: 'manual_review' as ReviewNodeType,
    title: `人工复核：${r.conclusion}`,
    timestamp: r.reviewTime,
    description: `复核人 ${r.reviewer}，结论 ${r.conclusion}${r.remark ? `，备注：${r.remark}` : ''}`,
    responsible: tplCfg?.defaultResponsible || r.reviewer,
    ruleHits: [],
    evidences: [
      {
        description: '人工复核原始行',
        sourceFile: r.sourceFile,
        sourceRows: [r.sourceRow],
        rawData: { reviewer: r.reviewer, conclusion: r.conclusion, remark: r.remark },
      },
    ],
    attachmentNames: [],
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildHandoverNodes(
  batch: ArrivalBatch,
  handovers: HandoverRecord[],
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode[] {
  const batchHandovers = handovers.filter((h) => h.items.some((it) => it.batchId === batch.batchId));
  if (batchHandovers.length === 0) return [];

  const now = new Date().toISOString();
  return batchHandovers.map((h) => {
    const item = h.items.find((it) => it.batchId === batch.batchId);
    return {
      id: genNodeId(),
      nodeType: 'handover' as ReviewNodeType,
      title: `交接流转：${h.title}（${h.status}）`,
      timestamp: h.createdAt,
      description: `${h.handedBy} → ${h.receivedBy}，截止 ${h.deadline}${h.remark ? `，备注：${h.remark}` : ''}${h.returnReason ? `，退回原因：${h.returnReason}` : ''}`,
      responsible: tplCfg?.defaultResponsible || h.receivedBy,
      ruleHits: [],
      evidences: [
        {
          description: `交接记录 ${h.id}`,
          sourceRows: item?.sourceRows ?? [],
          rawData: {
            handoverId: h.id,
            handedBy: h.handedBy,
            receivedBy: h.receivedBy,
            status: h.status,
            originalConclusion: item?.originalConclusion,
            originalReviewer: item?.originalReviewer,
          },
        },
      ],
      attachmentNames: [],
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function buildSupplierRiskNode(
  batch: ArrivalBatch,
  profiles: SupplierRiskProfile[],
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode | null {
  if (!batch.supplier) return null;
  const profile = profiles.find(
    (p) => p.nameVariants.includes(batch.supplier!) || p.canonicalName === batch.supplier,
  );
  if (!profile) return null;

  const now = new Date().toISOString();
  return {
    id: genNodeId(),
    nodeType: 'supplier_risk',
    title: `供应商画像：${profile.displayName}（${profile.riskLevel}）`,
    timestamp: batch.arrivalTime,
    description: `风险等级 ${profile.riskLevel}，分数 ${profile.riskScore}，累计 ${profile.batchCount} 批次 ${profile.totalAnomalies} 异常${profile.hasUnresolvedNameConflict ? '，存在名称冲突待处理' : ''}`,
    responsible: tplCfg?.defaultResponsible,
    ruleHits: [profile.riskLevel],
    evidences: [
      {
        description: `供应商风险画像（${profile.batches.length} 个关联批次）`,
        sourceRows: profile.batches.flatMap((b) => b.sourceRows),
        rawData: {
          supplierName: profile.displayName,
          riskLevel: profile.riskLevel,
          riskScore: profile.riskScore,
          batchCount: profile.batchCount,
          totalAnomalies: profile.totalAnomalies,
          dangerAnomalies: profile.dangerAnomalies,
        },
      },
    ],
    attachmentNames: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDispositionNode(
  batch: ArrivalBatch,
  decision?: { conclusion: ReviewConclusion; reviewer: string; remark: string; updatedAt: string },
  tplCfg?: ReviewTemplateNodeConfig,
): ReviewNode {
  const now = new Date().toISOString();
  return {
    id: genNodeId(),
    nodeType: 'disposition',
    title: decision ? `处置结论：${decision.conclusion}` : '处置结论（待填写）',
    timestamp: decision?.updatedAt || now,
    description: decision
      ? `复核人 ${decision.reviewer}，结论 ${decision.conclusion}${decision.remark ? `，备注：${decision.remark}` : ''}`
      : '请填写最终处置结论、责任人和备注',
    responsible: tplCfg?.defaultResponsible || decision?.reviewer,
    ruleHits: [],
    evidences: decision
      ? [
          {
            description: '复核决策记录',
            sourceRows: [],
            rawData: { conclusion: decision.conclusion, reviewer: decision.reviewer, remark: decision.remark },
          },
        ]
      : [],
    conclusion: decision?.conclusion,
    attachmentNames: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface BuildReviewParams {
  title?: string;
  batchIds: string[];
  batches: ArrivalBatch[];
  logs: TemperatureLog[];
  anomalies: Anomaly[];
  reviews: ManualReviewRecord[];
  decisions: Record<string, { conclusion: ReviewConclusion; reviewer: string; remark: string; updatedAt: string }>;
  handovers: HandoverRecord[];
  supplierProfiles: SupplierRiskProfile[];
  template: ReviewTemplate;
  createdBy: string;
  filtersSnapshot?: Record<string, unknown>;
  initialSeverity?: ReviewSeverityLevel;
}

export function buildReviewRecord(params: BuildReviewParams): ReviewRecord {
  const {
    title,
    batchIds,
    batches,
    logs,
    anomalies,
    reviews,
    decisions,
    handovers,
    supplierProfiles,
    template,
    createdBy,
    filtersSnapshot,
    initialSeverity,
  } = params;

  const now = new Date().toISOString();
  const targetBatches = batches.filter((b) => batchIds.includes(b.batchId));
  const supplierName = targetBatches[0]?.supplier;

  const tplNodeMap = new Map(
    template.nodes.map((n) => [n.nodeType, n]),
  );

  const nodes: ReviewNode[] = [];
  for (const batch of targetBatches) {
    nodes.push(buildArrivalNode(batch, tplNodeMap.get('arrival')));
    nodes.push(...buildTemperatureNodes(batch, logs, tplNodeMap.get('temperature')));
    nodes.push(...buildAnomalyNodes(batch, anomalies, undefined, tplNodeMap.get('anomaly_detect')));
    nodes.push(...buildManualReviewNodes(batch, reviews, tplNodeMap.get('manual_review')));
    nodes.push(...buildHandoverNodes(batch, handovers, tplNodeMap.get('handover')));
    const supplierNode = buildSupplierRiskNode(batch, supplierProfiles, tplNodeMap.get('supplier_risk'));
    if (supplierNode) nodes.push(supplierNode);
    nodes.push(buildDispositionNode(batch, decisions[batch.batchId], tplNodeMap.get('disposition')));
  }

  const sortedNodes = nodes.sort(
    (a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime(),
  );

  let severity: ReviewSeverityLevel = initialSeverity ?? template.defaultSeverity;
  const dangerCount = nodes.filter((n) => n.severity === 'major' || n.severity === 'critical').length;
  if (dangerCount >= 3) severity = 'critical';
  else if (dangerCount >= 1) severity = 'major';

  const defaultTitle = title
    || `复盘-${batchIds.join('/')}-${new Date().toLocaleString('zh-CN')}`;

  return {
    id: genReviewId(),
    title: defaultTitle,
    severity,
    status: 'draft',
    batchIds: [...batchIds],
    supplierName,
    templateId: template.id,
    templateSnapshot: JSON.parse(JSON.stringify(template)),
    nodes: sortedNodes,
    createdBy,
    createdAt: now,
    updatedAt: now,
    filtersSnapshot,
    logs: [
      createReviewLog(
        'review_create',
        createdBy,
        `创建复盘单，批次 ${batchIds.join(', ')}，使用模板 ${template.name}`,
        { batchIds, templateId: template.id, nodeCount: sortedNodes.length },
      ),
    ],
  };
}

export function detectReviewConflicts(
  newRecord: ReviewRecord,
  existingRecords: ReviewRecord[],
): ReviewConflict[] {
  const conflicts: ReviewConflict[] = [];

  const sameBatchReviews = existingRecords.filter(
    (r) => r.id !== newRecord.id && r.batchIds.some((bid) => newRecord.batchIds.includes(bid)),
  );
  if (sameBatchReviews.length > 0) {
    conflicts.push({
      id: genConflictId(),
      type: 'multi_ref',
      severity: 'warning',
      title: '批次被多个复盘单引用',
      description: `批次 ${newRecord.batchIds.join(', ')} 已被复盘单 ${sameBatchReviews.map((r) => r.id).join(', ')} 引用，合并后可避免重复工作`,
      relatedBatchIds: [...newRecord.batchIds],
      relatedReviewIds: sameBatchReviews.map((r) => r.id),
      options: [
        {
          key: 'merge',
          label: `合并到现有复盘单（推荐）`,
          description: `将当前节点合并到 ${sameBatchReviews[0].title}`,
          isRecommended: true,
        },
        { key: 'keep_separate', label: '保持独立', description: '不合并，允许同一批次多个复盘' },
      ],
    });
  }

  const emptyOwnerNodes = newRecord.nodes.filter(
    (n) => !n.responsible || n.responsible.trim() === '',
  );
  if (emptyOwnerNodes.length > 0) {
    conflicts.push({
      id: genConflictId(),
      type: 'empty_owner',
      severity: 'warning',
      title: '存在未指定负责人的节点',
      description: `${emptyOwnerNodes.length} 个节点未填写负责人：${emptyOwnerNodes.map((n) => REVIEW_NODE_TYPE_LABEL[n.nodeType]).join('、')}`,
      relatedBatchIds: [...newRecord.batchIds],
      relatedReviewIds: [newRecord.id],
      options: [
        { key: 'assign_auto', label: '按模板默认负责人补全', description: '使用模板中配置的默认负责人', isRecommended: true },
        { key: 'keep_empty', label: '暂不指定', description: '保存草稿，稍后补充' },
      ],
    });
  }

  const dispositionNodes = newRecord.nodes.filter((n) => n.nodeType === 'disposition' && n.conclusion);
  const dispositionSet = new Set(dispositionNodes.map((n) => n.conclusion));
  if (dispositionSet.size > 1) {
    conflicts.push({
      id: genConflictId(),
      type: 'conclusion_conflict',
      severity: 'danger',
      title: '处置结论互相冲突',
      description: `同一复盘单出现不同结论：${Array.from(dispositionSet).join(' / ')}，请确认是否统一`,
      relatedBatchIds: [...newRecord.batchIds],
      relatedReviewIds: [newRecord.id],
      options: [
        { key: 'use_quarantine', label: '统一为隔离（保守处理）', isRecommended: true },
        { key: 'use_release', label: '统一为放行' },
        { key: 'keep_conflict', label: '保留差异', description: '不同批次可按实际情况保留不同结论' },
      ],
    });
  }

  return conflicts;
}

export function resolveConflict(
  target: ReviewRecord,
  conflict: ReviewConflict,
  optionKey: string,
  operator: string,
  allRecords: ReviewRecord[],
  templates: ReviewTemplate[],
): { updated: ReviewRecord; allRecords: ReviewRecord[]; mergedFromId?: string } {
  const logEntry = createReviewLog(
    'conflict_resolved',
    operator,
    `处理冲突 ${conflict.type}，选择 ${optionKey}`,
    { conflictId: conflict.id, conflictType: conflict.type, option: optionKey },
  );
  target.logs = [...target.logs, logEntry];
  target.updatedAt = new Date().toISOString();

  if (conflict.type === 'empty_owner' && optionKey === 'assign_auto') {
    const tpl = templates.find((t) => t.id === target.templateId) || target.templateSnapshot;
    const responsibleMap = new Map(
      tpl.nodes.map((n) => [n.nodeType, n.defaultResponsible || '']),
    );
    target.nodes = target.nodes.map((n) =>
      !n.responsible || n.responsible.trim() === ''
        ? { ...n, responsible: responsibleMap.get(n.nodeType) || '', updatedAt: new Date().toISOString() }
        : n,
    );
  }

  if (conflict.type === 'conclusion_conflict') {
    let newConclusion: ReviewConclusion | null = null;
    if (optionKey === 'use_quarantine') newConclusion = 'quarantine';
    else if (optionKey === 'use_release') newConclusion = 'release';
    if (newConclusion) {
      target.nodes = target.nodes.map((n) =>
        n.nodeType === 'disposition'
          ? { ...n, conclusion: newConclusion!, updatedAt: new Date().toISOString() }
          : n,
      );
    }
  }

  if (conflict.type === 'multi_ref' && optionKey === 'merge') {
    const sourceId = conflict.relatedReviewIds[0];
    const source = allRecords.find((r) => r.id === sourceId);
    if (source) {
      const mergedNodes = [...source.nodes, ...target.nodes];
      const sorted = mergedNodes.sort(
        (a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime(),
      );
      const merged: ReviewRecord = {
        ...source,
        nodes: sorted,
        batchIds: Array.from(new Set([...source.batchIds, ...target.batchIds])),
        updatedAt: new Date().toISOString(),
        logs: [
          ...source.logs,
          createReviewLog(
            'review_merge',
            operator,
            `合并复盘单 ${target.id} 到 ${source.id}，合并后共 ${sorted.length} 个节点`,
            { mergedFromId: target.id, mergedToId: source.id, totalNodes: sorted.length },
          ),
        ],
      };
      const rest = allRecords.filter((r) => r.id !== source.id && r.id !== target.id);
      return { updated: merged, allRecords: [merged, ...rest], mergedFromId: target.id };
    }
  }

  return { updated: target, allRecords: allRecords.map((r) => (r.id === target.id ? target : r)) };
}

export function applyReviewFilters(
  records: ReviewRecord[],
  filters: ReviewFilterState = INITIAL_REVIEW_FILTER,
): ReviewRecord[] {
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
    if (filters.severities.length > 0 && !filters.severities.includes(r.severity)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) return false;
    if (filters.batchId && !r.batchIds.some((b) => b.toLowerCase().includes(filters.batchId.toLowerCase()))) return false;
    if (filters.supplierName) {
      if (!r.supplierName || !r.supplierName.toLowerCase().includes(filters.supplierName.toLowerCase())) return false;
    }
    if (filters.createdBy && !r.createdBy.toLowerCase().includes(filters.createdBy.toLowerCase())) return false;
    if (filters.startDate && r.createdAt < filters.startDate) return false;
    if (filters.endDate && r.createdAt > filters.endDate + 'T23:59:59') return false;
    return true;
  });
}

export function getReviewMetrics(records: ReviewRecord[]) {
  const byStatus: Record<ReviewStatus, number> = {
    draft: 0,
    in_progress: 0,
    completed: 0,
    archived: 0,
  };
  const bySeverity: Record<ReviewSeverityLevel, number> = {
    minor: 0,
    moderate: 0,
    major: 0,
    critical: 0,
  };
  for (const r of records) {
    byStatus[r.status] += 1;
    bySeverity[r.severity] += 1;
  }
  return { total: records.length, byStatus, bySeverity };
}

export interface ReviewExportContext {
  filterSnapshot: ReviewFilterState;
  templatesSnapshot: ReviewTemplate[];
  exportedAt: string;
  exportedBy: string;
}

export function buildReviewExportJson(
  records: ReviewRecord[],
  ctx: ReviewExportContext,
): string {
  const payload = {
    exportedAt: ctx.exportedAt,
    exportedBy: ctx.exportedBy,
    filterSnapshot: ctx.filterSnapshot,
    templatesSnapshot: ctx.templatesSnapshot,
    reviewRecords: records.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity,
      status: r.status,
      batchIds: r.batchIds,
      supplierName: r.supplierName,
      templateId: r.templateId,
      templateSnapshot: r.templateSnapshot,
      filtersSnapshot: r.filtersSnapshot,
      nodes: r.nodes,
      logs: r.logs,
      evidenceList: r.nodes.flatMap((n, idx) =>
        n.evidences.map((e) => ({
          reviewId: r.id,
          nodeIndex: idx,
          nodeType: n.nodeType,
          nodeTitle: n.title,
          description: e.description,
          sourceFile: e.sourceFile,
          sourceRows: e.sourceRows,
        })),
      ),
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function buildReviewExportCsv(
  records: ReviewRecord[],
  ctx: ReviewExportContext,
): string {
  const summaryRows = records.map((r) => ({
    复盘ID: r.id,
    标题: r.title,
    严重级别: r.severity,
    状态: r.status,
    批次号: r.batchIds.join('; '),
    供应商: r.supplierName ?? '',
    使用模板: r.templateSnapshot.name,
    节点数: r.nodes.length,
    创建人: r.createdBy,
    创建时间: r.createdAt,
    更新时间: r.updatedAt,
    完成时间: r.completedAt ?? '',
  }));

  const nodeRows: Array<Record<string, unknown>> = [];
  const evidenceRows: Array<Record<string, unknown>> = [];
  const logRows: Array<Record<string, unknown>> = [];

  for (const r of records) {
    for (const n of r.nodes) {
      nodeRows.push({
        复盘ID: r.id,
        节点ID: n.id,
        节点类型: n.nodeType,
        标题: n.title,
        时间: n.timestamp,
        严重级别: n.severity ?? '',
        负责人: n.responsible ?? '',
        命中规则: n.ruleHits.join('; '),
        备注: n.remark ?? '',
        附件: n.attachmentNames.join('; '),
        处置结论: n.conclusion ?? '',
        描述: n.description,
        创建时间: n.createdAt,
        更新时间: n.updatedAt,
      });
      for (const e of n.evidences) {
        evidenceRows.push({
          复盘ID: r.id,
          节点ID: n.id,
          证据描述: e.description,
          来源文件: e.sourceFile ?? '',
          原始行号: e.sourceRows.join('; '),
        });
      }
    }
    for (const l of r.logs) {
      logRows.push({
        复盘ID: r.id,
        日志ID: l.id,
        操作类型: l.action,
        操作人: l.operator,
        时间: l.timestamp,
        详情: l.details,
        元数据: JSON.stringify(l.metadata ?? {}),
      });
    }
  }

  const parts: string[] = [];
  parts.push('=== 复盘单汇总 ===\n' + Papa.unparse(summaryRows));
  if (nodeRows.length > 0) {
    parts.push('\n=== 复盘节点明细 ===\n' + Papa.unparse(nodeRows));
  }
  if (evidenceRows.length > 0) {
    parts.push('\n=== 证据清单 ===\n' + Papa.unparse(evidenceRows));
  }
  if (logRows.length > 0) {
    parts.push('\n=== 复盘操作日志 ===\n' + Papa.unparse(logRows));
  }
  parts.push(
    '\n=== 导出时筛选条件快照 ===\n' +
      Papa.unparse([
        {
          字段: 'filterSnapshot',
          值: JSON.stringify(ctx.filterSnapshot),
        },
      ]),
  );
  parts.push(
    '\n=== 导出时模板快照 ===\n' +
      Papa.unparse([
        {
          字段: 'templatesSnapshot',
          值: JSON.stringify(ctx.templatesSnapshot),
        },
      ]),
  );
  return parts.join('\n\n');
}
