import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  ArrivalBatch,
  AuditAction,
  AuditLog,
  AuditLogFilter,
  FilterState,
  ImportResult,
  ManualReviewRecord,
  ReviewConclusion,
  ReviewDecision,
  ReviewHistoryEntry,
  ReviewRules,
  TemperatureLog,
} from '@/types';
import { DEFAULT_REVIEW_RULES, PERSIST_STORAGE_KEY } from '@/types';
import {
  buildExportCsv,
  buildExportJson,
  buildImportRecord,
  computeFileHash,
  downloadFile,
  parseArrivalCsv,
  parseLogCsv,
  parseReviewCsv,
  wrapImportError,
  wrapImportSuccess,
} from '@/services/csvService';
import { detectAllAnomalies } from '@/services/anomalyEngine';
import { sampleArrivals, sampleLogs, sampleReviews } from '@/data/sampleData';

const initialFilters: FilterState = {
  batchId: '',
  anomalyTypes: [],
  reviewStatuses: [],
};

const initialAuditLogFilter: AuditLogFilter = {
  actions: [],
  operator: '',
};

function genAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAuditLog(
  action: AuditAction,
  operator: string,
  details: string,
  metadata?: Record<string, unknown>,
): AuditLog {
  return {
    id: genAuditId(),
    action,
    operator: operator || '系统',
    timestamp: new Date().toISOString(),
    details,
    metadata,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const appendAudit = (log: AuditLog) => {
        set((s) => ({ auditLogs: [log, ...s.auditLogs].slice(0, 500) }));
      };

      return ({
        arrivalBatches: [],
        temperatureLogs: [],
        manualReviews: [],
        anomalies: [],
        reviewDecisions: {},
        reviewHistory: {},
        importRecords: [],
        auditLogs: [],
        reviewRules: { ...DEFAULT_REVIEW_RULES },

        currentReviewer: '',
        filters: initialFilters,
        auditLogFilter: initialAuditLogFilter,
        selectedBatchId: null,

        importArrivals: async (file: File): Promise<ImportResult> => {
        const existing = get().arrivalBatches;
        const hash = await computeFileHash(file);
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'arrival' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        const result = await parseArrivalCsv(file, existing);
        if (result.missingColumns.length > 0) {
          return wrapImportError(
            `缺少必填列: ${result.missingColumns.join(', ')}`,
            result.missingColumns,
          );
        }
        const record = buildImportRecord(
          'arrival',
          file.name,
          hash,
          result.valid.length,
          result.invalid.length,
          result.invalid,
        );
        set((s) => ({
          arrivalBatches: [...s.arrivalBatches, ...result.valid],
          importRecords: [...s.importRecords, record],
        }));
        appendAudit(
          createAuditLog(
            'import_arrival',
            get().currentReviewer,
            `导入到货清单 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows },
          ),
        );
        get().detectAnomalies();
        return wrapImportSuccess(record);
      },

      importTemperatureLogs: async (file: File): Promise<ImportResult> => {
        const existing = get().temperatureLogs;
        const hash = await computeFileHash(file);
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'log' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        const result = await parseLogCsv(file, existing);
        if (result.missingColumns.length > 0) {
          return wrapImportError(
            `缺少必填列: ${result.missingColumns.join(', ')}`,
            result.missingColumns,
          );
        }
        const record = buildImportRecord(
          'log',
          file.name,
          hash,
          result.valid.filter((r) => r.isValid).length,
          result.valid.filter((r) => !r.isValid).length + result.invalid.length,
          [
            ...result.invalid,
            ...result.valid
              .filter((r) => !r.isValid)
              .map((r) => ({ row: r.sourceRow, reason: r.invalidReason ?? '无效记录' })),
          ],
        );
        set((s) => ({
          temperatureLogs: [...s.temperatureLogs, ...result.valid],
          importRecords: [...s.importRecords, record],
        }));
        appendAudit(
          createAuditLog(
            'import_log',
            get().currentReviewer,
            `导入温度日志 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows },
          ),
        );
        get().detectAnomalies();
        return wrapImportSuccess(record);
      },

      importManualReviews: async (file: File): Promise<ImportResult> => {
        const existing = get().manualReviews;
        const hash = await computeFileHash(file);
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'review' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        const result = await parseReviewCsv(file, existing);
        if (result.missingColumns.length > 0) {
          return wrapImportError(
            `缺少必填列: ${result.missingColumns.join(', ')}`,
            result.missingColumns,
          );
        }
        const record = buildImportRecord(
          'review',
          file.name,
          hash,
          result.valid.length,
          result.invalid.length,
          result.invalid,
        );
        set((s) => ({
          manualReviews: [...s.manualReviews, ...result.valid],
          importRecords: [...s.importRecords, record],
        }));
        appendAudit(
          createAuditLog(
            'import_review',
            get().currentReviewer,
            `导入复核记录 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows },
          ),
        );
        get().detectAnomalies();
        return wrapImportSuccess(record);
      },

      loadSampleData: () => {
        const existingBatchIds = new Set(get().arrivalBatches.map((b) => b.batchId));
        const existingLogIds = new Set(get().temperatureLogs.map((l) => l.id));
        const newBatches = sampleArrivals.filter((b) => !existingBatchIds.has(b.batchId));
        const newLogs = sampleLogs.filter((l) => !existingLogIds.has(l.id));
        const existingReviewIds = new Set(get().manualReviews.map((r) => r.id));
        const newReviews = sampleReviews.filter((r) => !existingReviewIds.has(r.id));

        set((s) => ({
          arrivalBatches: [...s.arrivalBatches, ...newBatches],
          temperatureLogs: [...s.temperatureLogs, ...newLogs],
          manualReviews: [...s.manualReviews, ...newReviews],
          currentReviewer: s.currentReviewer || '质控员',
        }));
        appendAudit(
          createAuditLog(
            'load_sample',
            get().currentReviewer,
            `加载样例数据：批次 ${newBatches.length} 条，日志 ${newLogs.length} 条，复核 ${newReviews.length} 条`,
            { newBatches: newBatches.length, newLogs: newLogs.length, newReviews: newReviews.length },
          ),
        );
        get().detectAnomalies();
      },

      detectAnomalies: () => {
        const s = get();
        const anomalies = detectAllAnomalies(
          s.arrivalBatches,
          s.temperatureLogs,
          s.manualReviews,
          s.reviewDecisions,
          s.reviewRules,
        );
        set({ anomalies });
      },

      setReviewDecision: (batchId: string, conclusion: ReviewConclusion, remark: string) => {
        const reviewer = get().currentReviewer || '未知复核人';
        const existing = get().reviewDecisions[batchId];

        if (existing) {
          const historyEntry: ReviewHistoryEntry = {
            id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            batchId,
            conclusion: existing.conclusion,
            reviewer: existing.reviewer,
            remark: existing.remark,
            updatedAt: existing.updatedAt,
          };
          set((s) => ({
            reviewHistory: {
              ...s.reviewHistory,
              [batchId]: [...(s.reviewHistory[batchId] ?? []), historyEntry],
            },
          }));
        }

        const decision: ReviewDecision = {
          batchId,
          conclusion,
          reviewer,
          remark,
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({
          reviewDecisions: {
            ...s.reviewDecisions,
            [batchId]: decision,
          },
        }));
        appendAudit(
          createAuditLog(
            'review_decision',
            reviewer,
            `批次 ${batchId}：${existing ? `${existing.conclusion} →` : ''} ${conclusion}${remark ? `，备注：${remark}` : ''}`,
            { batchId, fromConclusion: existing?.conclusion ?? null, toConclusion: conclusion, remark },
          ),
        );
        get().detectAnomalies();
      },

      undoReviewDecision: (batchId: string) => {
        const history = get().reviewHistory[batchId];
        if (!history || history.length === 0) return;
        const prev = history[history.length - 1];
        set((s) => {
          const newHistory = { ...s.reviewHistory };
          newHistory[batchId] = (newHistory[batchId] ?? []).slice(0, -1);
          if (newHistory[batchId].length === 0) delete newHistory[batchId];
          return {
            reviewHistory: newHistory,
            reviewDecisions: {
              ...s.reviewDecisions,
              [batchId]: {
                batchId,
                conclusion: prev.conclusion,
                reviewer: prev.reviewer,
                remark: prev.remark,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        appendAudit(
          createAuditLog(
            'undo_review',
            get().currentReviewer || '未知复核人',
            `批次 ${batchId}：撤销至 ${prev.conclusion}（${prev.reviewer}）`,
            { batchId, revertedTo: prev.conclusion, revertedReviewer: prev.reviewer },
          ),
        );
        get().detectAnomalies();
      },

      setReviewRules: (rules: Partial<ReviewRules>) => {
        const before = get().reviewRules;
        const merged: ReviewRules = { ...before, ...rules };
        set({ reviewRules: merged });
        const changes: string[] = [];
        for (const k of Object.keys(rules) as (keyof ReviewRules)[]) {
          if (before[k] !== merged[k]) {
            changes.push(`${k}: ${before[k]} → ${merged[k]}`);
          }
        }
        if (changes.length > 0) {
          appendAudit(
            createAuditLog(
              'change_rules',
              get().currentReviewer || '未知复核人',
              `复核规则变更：${changes.join('；')}`,
              { before, after: merged, changes },
            ),
          );
        }
        get().detectAnomalies();
      },

      resetReviewRules: () => {
        const before = get().reviewRules;
        set({ reviewRules: { ...DEFAULT_REVIEW_RULES } });
        appendAudit(
          createAuditLog(
            'change_rules',
            get().currentReviewer || '未知复核人',
            '复核规则已恢复默认值',
            { before, after: { ...DEFAULT_REVIEW_RULES } },
          ),
        );
        get().detectAnomalies();
      },

      setCurrentReviewer: (name: string) => set({ currentReviewer: name }),
      setFilters: (filters: Partial<FilterState>) =>
        set((s) => ({ filters: { ...s.filters, ...filters } })),
      setAuditLogFilter: (filters: Partial<AuditLogFilter>) =>
        set((s) => ({ auditLogFilter: { ...s.auditLogFilter, ...filters } })),
      setSelectedBatchId: (batchId: string | null) => set({ selectedBatchId: batchId }),

      exportData: (format: 'json' | 'csv') => {
        const s = get();
        const filtered = applyFilters(s.anomalies, s.reviewDecisions, s.filters);
        const filteredAudit = applyAuditLogFilters(s.auditLogs, s.auditLogFilter);
        const exportTime = new Date().toISOString();
        const ts = exportTime.replace(/[:.]/g, '-').slice(0, 19);

        appendAudit(
          createAuditLog(
            'export_data',
            s.currentReviewer || '未知复核人',
            `导出数据：${format.toUpperCase()}，共 ${filtered.length} 条异常${filteredAudit.length > 0 ? `，${filteredAudit.length} 条审计日志` : ''}`,
            { format, anomalyCount: filtered.length, auditLogCount: filteredAudit.length },
          ),
        );

        if (format === 'csv') {
          const content = buildExportCsv(
            filtered,
            s.arrivalBatches,
            s.reviewDecisions,
            filteredAudit,
          );
          downloadFile(content, `cold-chain-anomalies-${ts}.csv`, 'text/csv;charset=utf-8');
        } else {
          const content = buildExportJson(
            filtered,
            s.arrivalBatches,
            s.temperatureLogs,
            s.manualReviews,
            s.reviewDecisions,
            exportTime,
            filteredAudit,
            s.reviewRules,
            s.reviewHistory,
          );
          downloadFile(
            content,
            `cold-chain-anomalies-${ts}.json`,
            'application/json',
          );
        }
      },

      clearAll: () => {
        appendAudit(
          createAuditLog('clear_all', get().currentReviewer || '未知复核人', '清空所有数据'),
        );
        set({
          arrivalBatches: [],
          temperatureLogs: [],
          manualReviews: [],
          anomalies: [],
          reviewDecisions: {},
          reviewHistory: {},
          importRecords: [],
          filters: initialFilters,
          selectedBatchId: null,
        });
      },
    });
  },
  {
      name: PERSIST_STORAGE_KEY,
      partialize: (state) => ({
        arrivalBatches: state.arrivalBatches,
        temperatureLogs: state.temperatureLogs,
        manualReviews: state.manualReviews,
        anomalies: state.anomalies,
        reviewDecisions: state.reviewDecisions,
        reviewHistory: state.reviewHistory,
        importRecords: state.importRecords,
        auditLogs: state.auditLogs,
        reviewRules: state.reviewRules,
        currentReviewer: state.currentReviewer,
        filters: state.filters,
        auditLogFilter: state.auditLogFilter,
      }),
    },
  ),
);

export function applyFilters(
  anomalies: ReturnType<typeof useAppStore.getState>['anomalies'],
  decisions: Record<string, ReviewDecision>,
  filters: FilterState,
) {
  return anomalies.filter((a) => {
    if (filters.batchId && !a.batchId.toLowerCase().includes(filters.batchId.toLowerCase())) {
      return false;
    }
    if (filters.anomalyTypes.length > 0 && !filters.anomalyTypes.includes(a.type)) {
      return false;
    }
    if (filters.reviewStatuses.length > 0) {
      const status = decisions[a.batchId]?.conclusion ?? 'unreviewed';
      if (!filters.reviewStatuses.includes(status)) return false;
    }
    return true;
  });
}

export function applyAuditLogFilters(
  logs: AuditLog[],
  filters: AuditLogFilter,
) {
  return logs.filter((log) => {
    if (filters.actions.length > 0 && !filters.actions.includes(log.action)) {
      return false;
    }
    if (filters.operator && !log.operator.toLowerCase().includes(filters.operator.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function getBatchMetrics(
  batches: ArrivalBatch[],
  anomalies: ReturnType<typeof useAppStore.getState>['anomalies'],
  decisions: Record<string, ReviewDecision>,
) {
  const batchIds = new Set<string>();
  const overtempBatches = new Set<string>();
  const missingLogBatches = new Set<string>();
  const unregisteredBatches = new Set<string>();
  const conflictBatches = new Set<string>();

  for (const b of batches) batchIds.add(b.batchId);
  for (const a of anomalies) {
    batchIds.add(a.batchId);
    if (a.type === 'overtemp') overtempBatches.add(a.batchId);
    if (a.type === 'missing_log') missingLogBatches.add(a.batchId);
    if (a.type === 'unregistered') unregisteredBatches.add(a.batchId);
    if (a.type === 'review_conflict') conflictBatches.add(a.batchId);
  }

  const reviewedCount = Object.values(decisions).filter(
    (d) => d.conclusion !== 'unreviewed',
  ).length;

  return {
    totalBatches: batchIds.size,
    overtempCount: overtempBatches.size,
    missingLogCount: missingLogBatches.size,
    unregisteredCount: unregisteredBatches.size,
    conflictCount: conflictBatches.size,
    reviewedCount,
  };
}

export type { ArrivalBatch, TemperatureLog, ManualReviewRecord };
