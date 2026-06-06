import Papa from 'papaparse';
import type {
  ArrivalBatch,
  TemperatureLog,
  ManualReviewRecord,
  FileType,
  ImportRecord,
  InvalidRowDetail,
  ImportResult,
  ReviewConclusion,
  Anomaly,
  ReviewDecision,
  AuditLog,
  ReviewRules,
  ReviewHistoryEntry,
  HandoverRecord,
  FieldMapping,
  FieldMappingPreview,
  ColumnMappingSnapshot,
  SavedFieldMappings,
} from '@/types';
import { FIELD_ALIASES, FIELD_LABELS } from '@/types';
import { AUDIT_ACTION_LABEL, HANDOVER_STATUS_LABEL, ANOMALY_TYPE_LABEL, CONCLUSION_LABEL } from '@/services/anomalyEngine';

const FIELD_MAPPING_STORAGE_KEY = 'cold-chain-field-mappings-v1';

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function autoMatchField(fileType: FileType, headers: string[]): FieldMapping[] {
  const aliases = FIELD_ALIASES[fileType];
  const labels = FIELD_LABELS[fileType];
  const requiredColumns = REQUIRED_COLUMNS[fileType];
  const targetFields = Object.keys(aliases);
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

  const mappings: FieldMapping[] = targetFields.map((field) => {
    const fieldAliases = aliases[field];
    const normalizedAliases = fieldAliases.map(normalizeHeader);

    let matchedColumn: string | null = null;
    let matchReason: string | undefined;

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

  return mappings;
}

export function validateMappings(mappings: FieldMapping[]): {
  conflicts: string[];
  missingRequired: string[];
  invalidMappings: string[];
  canProceed: boolean;
} {
  const conflicts: string[] = [];
  const missingRequired: string[] = [];
  const invalidMappings: string[] = [];

  const usedColumns = new Map<string, string[]>();
  const labelsByField: Record<string, string> = {};

  for (const m of mappings) {
    if (m.sourceColumn && usedColumns.has(m.sourceColumn)) {
      const existing = usedColumns.get(m.sourceColumn)!;
      existing.push(m.targetField);
    } else if (m.sourceColumn) {
      usedColumns.set(m.sourceColumn, [m.targetField]);
    }
    if (FIELD_LABELS.arrival[m.targetField]) labelsByField[m.targetField] = FIELD_LABELS.arrival[m.targetField];
    if (FIELD_LABELS.log[m.targetField]) labelsByField[m.targetField] = FIELD_LABELS.log[m.targetField];
    if (FIELD_LABELS.review[m.targetField]) labelsByField[m.targetField] = FIELD_LABELS.review[m.targetField];
  }

  for (const [col, fields] of usedColumns.entries()) {
    if (fields.length > 1) {
      conflicts.push(`列 "${col}" 被映射到多个字段: ${fields.map((f) => labelsByField[f] || f).join(', ')}`);
    }
  }

  for (const m of mappings) {
    if (m.isRequired && !m.sourceColumn) {
      missingRequired.push(labelsByField[m.targetField] || m.targetField);
    }
  }

  return {
    conflicts,
    missingRequired,
    invalidMappings,
    canProceed: conflicts.length === 0 && missingRequired.length === 0,
  };
}

export function applyMappingToRow(
  row: Record<string, unknown>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const m of mappings) {
    if (m.sourceColumn && m.sourceColumn in row) {
      result[m.targetField] = row[m.sourceColumn];
    }
  }
  return result;
}

export function saveFieldMappings(fileType: FileType, mappings: ColumnMappingSnapshot[]): void {
  try {
    const raw = localStorage.getItem(FIELD_MAPPING_STORAGE_KEY);
    const saved: SavedFieldMappings = raw ? JSON.parse(raw) : {};
    saved[fileType] = mappings;
    saved.updatedAt = new Date().toISOString();
    localStorage.setItem(FIELD_MAPPING_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // ignore
  }
}

export function loadFieldMappings(): SavedFieldMappings {
  try {
    const raw = localStorage.getItem(FIELD_MAPPING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getSavedMappingForType(fileType: FileType): ColumnMappingSnapshot[] | undefined {
  return loadFieldMappings()[fileType];
}

export function checkSavedMappingOutdated(
  fileType: FileType,
  headers: string[],
): { outdated: boolean; outdatedFields: string[] } {
  const saved = getSavedMappingForType(fileType);
  if (!saved || saved.length === 0) {
    return { outdated: false, outdatedFields: [] };
  }
  const headerSet = new Set(headers);
  const outdatedFields: string[] = [];
  for (const sm of saved) {
    if (sm.sourceColumn && !headerSet.has(sm.sourceColumn)) {
      outdatedFields.push(sm.targetField);
    }
  }
  return { outdated: outdatedFields.length > 0, outdatedFields };
}

export function applySavedMappings(
  fileType: FileType,
  autoMappings: FieldMapping[],
  headers: string[],
): { mappings: FieldMapping[]; applied: boolean } {
  const saved = getSavedMappingForType(fileType);
  if (!saved || saved.length === 0) {
    return { mappings: autoMappings, applied: false };
  }
  const headerSet = new Set(headers);
  const merged = autoMappings.map((am) => {
    const sm = saved.find((s) => s.targetField === am.targetField);
    if (sm && sm.sourceColumn && headerSet.has(sm.sourceColumn)) {
      return {
        ...am,
        sourceColumn: sm.sourceColumn,
        matchedAutomatically: false,
        matchReason: '已应用本地保存的映射配置',
      };
    }
    return am;
  });
  return { mappings: merged, applied: true };
}

export async function buildFieldMappingPreview(
  file: File,
  fileType: FileType,
): Promise<FieldMappingPreview> {
  const rows = await parseCsvFile(file);
  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);
  const previewRows = rows.slice(0, 5);
  const autoMappings = autoMatchField(fileType, headers);
  const { mappings: applied } = applySavedMappings(fileType, autoMappings, headers);
  const savedMapping = getSavedMappingForType(fileType);
  const { outdated, outdatedFields } = checkSavedMappingOutdated(fileType, headers);
  const validation = validateMappings(applied);
  const mappingSnapshot: ColumnMappingSnapshot[] = applied.map((m) => ({
    targetField: m.targetField,
    sourceColumn: m.sourceColumn,
  }));

  return {
    fileType,
    fileName: file.name,
    headers,
    previewRows,
    mappings: applied,
    ...validation,
    savedMappingAvailable: !!savedMapping,
    savedMappingOutdated: outdated,
    outdatedFields,
    mappingSnapshot,
  };
}

function normalizeRowWithMapping(
  row: Record<string, unknown>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const mapped = applyMappingToRow(row, mappings);
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(mapped)) {
    normalized[key.trim().toLowerCase()] = mapped[key];
  }
  return normalized;
}


const REQUIRED_COLUMNS: Record<FileType, string[]> = {
  arrival: ['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax'],
  log: ['batchId', 'timestamp', 'temperature'],
  review: ['batchId', 'reviewer', 'conclusion'],
};

function isValidDate(d: unknown): boolean {
  if (d instanceof Date) return !isNaN(d.getTime());
  if (typeof d !== 'string') return false;
  const parsed = new Date(d);
  return !isNaN(parsed.getTime());
}

function parseDate(d: string): string {
  return new Date(d).toISOString();
}

function isValidReviewConclusion(v: string): v is ReviewConclusion {
  return ['release', 'quarantine', 'ignore', 'unreviewed'].includes(v);
}

function checkMissingColumns(headers: string[], fileType: FileType): string[] {
  const required = REQUIRED_COLUMNS[fileType];
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  return required.filter((col) => !lowerHeaders.includes(col.toLowerCase()));
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    normalized[key.trim().toLowerCase()] = row[key];
  }
  return normalized;
}

export async function parseCsvFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: (err) => reject(err),
    });
  });
}

export function parseCsvString(content: string): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

export async function parseArrivalCsv(
  file: File,
  existing: ArrivalBatch[],
  fieldMappings?: FieldMapping[],
): Promise<{ valid: ArrivalBatch[]; invalid: InvalidRowDetail[]; missingColumns: string[] }> {
  const rows = await parseCsvFile(file);
  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);

  if (!fieldMappings || fieldMappings.length === 0) {
    const missingColumns = checkMissingColumns(headers, 'arrival');
    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }
  }

  const existingIds = new Set(existing.map((b) => b.batchId));
  const valid: ArrivalBatch[] = [];
  const invalid: InvalidRowDetail[] = [];

  rows.forEach((row, idx) => {
    const r = fieldMappings && fieldMappings.length > 0
      ? normalizeRowWithMapping(row, fieldMappings)
      : normalizeRow(row);
    const sourceRow = idx + 2;
    const batchId = String(r.batchid ?? '').trim();

    if (!batchId) {
      invalid.push({ row: sourceRow, reason: '批次号为空', raw: row });
      return;
    }
    if (existingIds.has(batchId)) {
      invalid.push({ row: sourceRow, reason: `批次 ${batchId} 已存在，已跳过` });
      return;
    }
    const productName = String(r.productname ?? '').trim();
    const arrivalTimeRaw = String(r.arrivaltime ?? '').trim();
    const tempMin = Number(r.requiredtempmin);
    const tempMax = Number(r.requiredtempmax);

    const errors: string[] = [];
    if (!productName) errors.push('产品名称为空');
    if (!isValidDate(arrivalTimeRaw)) errors.push(`到货时间格式错误: ${arrivalTimeRaw}`);
    if (isNaN(tempMin)) errors.push(`温度下限非数字: ${r.requiredtempmin}`);
    if (isNaN(tempMax)) errors.push(`温度上限非数字: ${r.requiredtempmax}`);

    if (errors.length > 0) {
      invalid.push({ row: sourceRow, reason: errors.join('; '), raw: row });
      return;
    }

    valid.push({
      batchId,
      productName,
      arrivalTime: parseDate(arrivalTimeRaw),
      requiredTempMin: tempMin,
      requiredTempMax: tempMax,
      supplier: r.supplier ? String(r.supplier).trim() : undefined,
      quantity: r.quantity ? Number(r.quantity) : undefined,
      sourceRow,
      sourceFile: file.name,
    });
    existingIds.add(batchId);
  });

  return { valid, invalid, missingColumns: [] };
}

export async function parseLogCsv(
  file: File,
  existing: TemperatureLog[],
  fieldMappings?: FieldMapping[],
): Promise<{ valid: TemperatureLog[]; invalid: InvalidRowDetail[]; missingColumns: string[] }> {
  const rows = await parseCsvFile(file);
  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);

  if (!fieldMappings || fieldMappings.length === 0) {
    const missingColumns = checkMissingColumns(headers, 'log');
    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }
  }

  const valid: TemperatureLog[] = [];
  const invalid: InvalidRowDetail[] = [];
  let seq = existing.length;

  rows.forEach((row, idx) => {
    const r = fieldMappings && fieldMappings.length > 0
      ? normalizeRowWithMapping(row, fieldMappings)
      : normalizeRow(row);
    const sourceRow = idx + 2;
    const batchId = String(r.batchid ?? '').trim();
    const timestampRaw = String(r.timestamp ?? '').trim();
    const tempRaw = String(r.temperature ?? '').trim();
    const temp = Number(tempRaw);

    if (!batchId) {
      invalid.push({ row: sourceRow, reason: '批次号为空', raw: row });
      return;
    }

    const reasons: string[] = [];
    if (!isValidDate(timestampRaw)) reasons.push(`时间格式错误: ${timestampRaw}`);
    if (isNaN(temp)) reasons.push(`温度非数字: ${tempRaw}`);

    valid.push({
      id: `log-${Date.now()}-${seq++}`,
      batchId,
      timestamp: isValidDate(timestampRaw) ? parseDate(timestampRaw) : timestampRaw,
      temperature: isNaN(temp) ? NaN : temp,
      rawValue: tempRaw,
      sourceRow,
      sourceFile: file.name,
      isValid: reasons.length === 0,
      invalidReason: reasons.length > 0 ? reasons.join('; ') : undefined,
    });
  });

  return { valid, invalid, missingColumns: [] };
}

export async function parseReviewCsv(
  file: File,
  existing: ManualReviewRecord[],
  fieldMappings?: FieldMapping[],
): Promise<{ valid: ManualReviewRecord[]; invalid: InvalidRowDetail[]; missingColumns: string[] }> {
  const rows = await parseCsvFile(file);
  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);

  if (!fieldMappings || fieldMappings.length === 0) {
    const missingColumns = checkMissingColumns(headers, 'review');
    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }
  }

  const valid: ManualReviewRecord[] = [];
  const invalid: InvalidRowDetail[] = [];
  let seq = existing.length;

  rows.forEach((row, idx) => {
    const r = fieldMappings && fieldMappings.length > 0
      ? normalizeRowWithMapping(row, fieldMappings)
      : normalizeRow(row);
    const sourceRow = idx + 2;
    const batchId = String(r.batchid ?? '').trim();
    const reviewer = String(r.reviewer ?? '').trim();
    const conclusionRaw = String(r.conclusion ?? '').trim().toLowerCase();
    const reviewTimeRaw = String(r.reviewtime ?? new Date().toISOString()).trim();

    const errors: string[] = [];
    if (!batchId) errors.push('批次号为空');
    if (!reviewer) errors.push('复核人为空');
    if (!isValidReviewConclusion(conclusionRaw)) errors.push(`复核结论无效: ${conclusionRaw}`);
    if (!isValidDate(reviewTimeRaw)) errors.push(`复核时间格式错误: ${reviewTimeRaw}`);

    if (errors.length > 0) {
      invalid.push({ row: sourceRow, reason: errors.join('; '), raw: row });
      return;
    }

    valid.push({
      id: `rev-${Date.now()}-${seq++}`,
      batchId,
      reviewer,
      conclusion: conclusionRaw as ReviewConclusion,
      remark: r.remark ? String(r.remark).trim() : undefined,
      reviewTime: parseDate(reviewTimeRaw),
      sourceRow,
      sourceFile: file.name,
    });
  });

  return { valid, invalid, missingColumns: [] };
}

export async function computeFileHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

export function buildImportRecord(
  fileType: FileType,
  fileName: string,
  fileHash: string | undefined,
  validRows: number,
  invalidRows: number,
  invalidDetails: InvalidRowDetail[],
): ImportRecord {
  return {
    id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileType,
    fileName,
    fileHash,
    totalRows: validRows + invalidRows,
    validRows,
    invalidRows,
    importedAt: new Date().toISOString(),
    invalidDetails,
  };
}

export function wrapImportError(message: string, missingColumns?: string[], skipped?: boolean): ImportResult {
  return { success: false, message, missingColumns, skipped };
}

export function wrapImportSuccess(record: ImportRecord): ImportResult {
  return {
    success: true,
    message: `导入成功：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
    record,
  };
}

export function buildExportCsv(
  anomalies: Anomaly[],
  batches: ArrivalBatch[],
  decisions: Record<string, ReviewDecision>,
  auditLogs?: AuditLog[],
): string {
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));
  const headers = [
    '批次号',
    '产品名称',
    '异常类型',
    '严重级别',
    '异常描述',
    '关联原始行号',
    '复核结论',
    '复核人',
    '备注',
    '更新时间',
  ];
  const typeMap: Record<string, string> = {
    overtemp: '超温',
    missing_log: '缺日志',
    unregistered: '到货未登记',
    review_conflict: '复核冲突',
  };
  const sevMap: Record<string, string> = { warning: '警告', danger: '严重' };
  const conclusionMap: Record<string, string> = {
    release: '放行',
    quarantine: '隔离',
    ignore: '忽略',
    unreviewed: '未复核',
  };
  const rows = anomalies.map((a) => {
    const b = batchMap.get(a.batchId);
    const d = decisions[a.batchId];
    return [
      a.batchId,
      b?.productName ?? '（未登记）',
      typeMap[a.type] ?? a.type,
      sevMap[a.severity] ?? a.severity,
      a.description,
      a.sourceRows.join(';'),
      d ? conclusionMap[d.conclusion] ?? d.conclusion : '未复核',
      d?.reviewer ?? '',
      d?.remark ?? '',
      d?.updatedAt ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  let result = [headers.join(','), ...rows].join('\n');

  if (auditLogs && auditLogs.length > 0) {
    result += '\n\n';
    const auditHeaders = [
      '审计时间',
      '操作类型',
      '操作人',
      '操作详情',
    ];
    const auditRows = auditLogs.map((log) => {
      return [
        log.timestamp,
        AUDIT_ACTION_LABEL[log.action] ?? log.action,
        log.operator,
        log.details,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    result += [auditHeaders.join(','), ...auditRows].join('\n');
  }

  return result;
}

export function buildExportJson(
  anomalies: Anomaly[],
  batches: ArrivalBatch[],
  logs: TemperatureLog[],
  reviews: ManualReviewRecord[],
  decisions: Record<string, ReviewDecision>,
  exportTime: string,
  auditLogs?: AuditLog[],
  reviewRules?: ReviewRules,
  reviewHistory?: Record<string, ReviewHistoryEntry[]>,
  fieldMappingsSnapshot?: SavedFieldMappings,
): string {
  const batchIds = new Set(anomalies.map((a) => a.batchId));
  return JSON.stringify(
    {
      exportedAt: exportTime,
      reviewRules: reviewRules ?? null,
      batches: batches.filter((b) => batchIds.has(b.batchId)),
      temperatureLogs: logs.filter((l) => batchIds.has(l.batchId)),
      manualReviews: reviews.filter((r) => batchIds.has(r.batchId)),
      anomalies,
      reviewDecisions: Object.fromEntries(
        Object.entries(decisions).filter(([k]) => batchIds.has(k)),
      ),
      reviewHistory: reviewHistory
        ? Object.fromEntries(Object.entries(reviewHistory).filter(([k]) => batchIds.has(k)))
        : undefined,
      auditLogs: auditLogs ?? [],
      fieldMappings: fieldMappingsSnapshot ?? loadFieldMappings(),
    },
    null,
    2,
  );
}

export function buildHandoverExportCsv(
  handoverRecords: HandoverRecord[],
): string {
  const headers = [
    '交接ID',
    '交接标题',
    '状态',
    '交接人',
    '接收人',
    '截止时间',
    '备注',
    '退回原因',
    '完成备注',
    '创建时间',
    '接收时间',
    '完成时间',
    '异常条目数',
  ];
  const sevMap: Record<string, string> = { warning: '警告', danger: '严重' };
  const rows = handoverRecords.map((h) => {
    return [
      h.id,
      h.title,
      HANDOVER_STATUS_LABEL[h.status] ?? h.status,
      h.handedBy,
      h.receivedBy,
      h.deadline,
      h.remark ?? '',
      h.returnReason ?? '',
      h.completedRemark ?? '',
      h.createdAt,
      h.acceptedAt ?? '',
      h.completedAt ?? '',
      h.items.length,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  let result = [headers.join(','), ...rows].join('\n');

  result += '\n\n';
  const itemHeaders = [
    '交接ID',
    '异常ID',
    '批次号',
    '异常类型',
    '严重级别',
    '原始复核状态',
    '原始复核人',
    '原始备注',
    '异常描述',
    '原始行号',
    '规则快照',
  ];
  const itemRows: string[] = [];
  for (const h of handoverRecords) {
    for (const item of h.items) {
      itemRows.push(
        [
          h.id,
          item.anomalyId,
          item.batchId,
          ANOMALY_TYPE_LABEL[item.anomalyType] ?? item.anomalyType,
          sevMap[item.severity] ?? item.severity,
          CONCLUSION_LABEL[item.originalConclusion] ?? item.originalConclusion,
          item.originalReviewer ?? '',
          item.originalRemark ?? '',
          item.description,
          item.sourceRows.join(';'),
          JSON.stringify(item.rulesSnapshot),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
    }
  }
  result += [itemHeaders.join(','), ...itemRows].join('\n');

  return result;
}

export function buildHandoverExportJson(
  handoverRecords: HandoverRecord[],
  exportTime: string,
): string {
  return JSON.stringify(
    {
      exportedAt: exportTime,
      handoverRecords,
    },
    null,
    2,
  );
}

export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
