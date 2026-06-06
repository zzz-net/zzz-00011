import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  ArrivalBatch,
  FilterState,
  ImportResult,
  ManualReviewRecord,
  ReviewConclusion,
  ReviewDecision,
  TemperatureLog,
} from '@/types';
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      arrivalBatches: [],
      temperatureLogs: [],
      manualReviews: [],
      anomalies: [],
      reviewDecisions: {},
      importRecords: [],
      currentReviewer: '',
      filters: initialFilters,
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
        get().detectAnomalies();
      },

      detectAnomalies: () => {
        const s = get();
        const anomalies = detectAllAnomalies(
          s.arrivalBatches,
          s.temperatureLogs,
          s.manualReviews,
          s.reviewDecisions,
        );
        set({ anomalies });
      },

      setReviewDecision: (batchId: string, conclusion: ReviewConclusion, remark: string) => {
        const reviewer = get().currentReviewer || '未知复核人';
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
        get().detectAnomalies();
      },

      setCurrentReviewer: (name: string) => set({ currentReviewer: name }),
      setFilters: (filters: Partial<FilterState>) =>
        set((s) => ({ filters: { ...s.filters, ...filters } })),
      setSelectedBatchId: (batchId: string | null) => set({ selectedBatchId: batchId }),

      exportData: (format: 'json' | 'csv') => {
        const s = get();
        const filtered = applyFilters(s.anomalies, s.reviewDecisions, s.filters);
        const exportTime = new Date().toISOString();
        const ts = exportTime.replace(/[:.]/g, '-').slice(0, 19);
        if (format === 'csv') {
          const content = buildExportCsv(filtered, s.arrivalBatches, s.reviewDecisions);
          downloadFile(content, `cold-chain-anomalies-${ts}.csv`, 'text/csv;charset=utf-8');
        } else {
          const content = buildExportJson(
            filtered,
            s.arrivalBatches,
            s.temperatureLogs,
            s.manualReviews,
            s.reviewDecisions,
            exportTime,
          );
          downloadFile(content, `cold-chain-anomalies-${ts}.json`, 'application/json');
        }
      },

      clearAll: () => {
        set({
          arrivalBatches: [],
          temperatureLogs: [],
          manualReviews: [],
          anomalies: [],
          reviewDecisions: {},
          importRecords: [],
          filters: initialFilters,
          selectedBatchId: null,
        });
      },
    }),
    {
      name: 'cold-chain-dashboard-v1',
      partialize: (state) => ({
        arrivalBatches: state.arrivalBatches,
        temperatureLogs: state.temperatureLogs,
        manualReviews: state.manualReviews,
        anomalies: state.anomalies,
        reviewDecisions: state.reviewDecisions,
        importRecords: state.importRecords,
        currentReviewer: state.currentReviewer,
        filters: state.filters,
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
