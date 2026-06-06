import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  ArrivalBatch,
  AuditAction,
  AuditLog,
  AuditLogFilter,
  ColumnMappingSnapshot,
  FieldMapping,
  FieldMappingPreview,
  FileType,
  FilterState,
  HandoverFilterState,
  HandoverItemSnapshot,
  HandoverLock,
  HandoverRecord,
  ImportResult,
  ManualReviewRecord,
  ReviewConclusion,
  ReviewDecision,
  ReviewHistoryEntry,
  ReviewRules,
  RulesPackageApplyResult,
  RulesPackagePreviewResult,
  SavedFieldMappings,
  TemperatureLog,
  SupplierRiskRules,
  SupplierNameResolutionMap,
  SupplierRiskFilterState,
  SupplierRiskProfile,
  SupplierRiskLevelRule,
  ReviewFilterState,
  ReviewTemplate,
  ReviewRecord,
  ReviewNode,
} from '@/types';
import {
  DEFAULT_REVIEW_RULES,
  DEFAULT_SUPPLIER_RISK_RULES,
  DEFAULT_REVIEW_TEMPLATES,
  FIELD_LABELS,
  PERSIST_STORAGE_KEY,
  INITIAL_REVIEW_FILTER,
} from '@/types';
import {
  buildExportCsv,
  buildExportJson,
  buildFieldMappingPreview,
  buildHandoverExportCsv,
  buildHandoverExportJson,
  buildImportRecord,
  buildSupplierRiskExportCsv,
  buildSupplierRiskExportJson,
  computeFileHash,
  downloadFile,
  loadFieldMappings,
  parseArrivalCsv,
  parseLogCsv,
  parseReviewCsv,
  saveFieldMappings,
  wrapImportError,
  wrapImportSuccess,
  parseCsvFile,
} from '@/services/csvService';
import { detectAllAnomalies } from '@/services/anomalyEngine';
import { sampleArrivals, sampleLogs, sampleReviews } from '@/data/sampleData';
import {
  exportRulesPackageFile,
  previewRulesPackage as previewRulesPackageService,
} from '@/services/rulesPackage';
import {
  buildSupplierRiskProfiles,
  filterSupplierRiskProfiles,
  loadSupplierNameResolution,
  loadSupplierRiskRules,
  normalizeSupplierName,
  saveSupplierNameResolution,
  saveSupplierRiskRules,
} from '@/services/supplierRiskService';
import {
  applyReviewFilters,
  buildReviewExportCsv,
  buildReviewExportJson,
  buildReviewRecord,
  createReviewLog,
  detectReviewConflicts,
  getReviewMetrics,
  loadReviewRecords,
  loadReviewTemplates,
  resolveConflict,
  saveReviewRecords,
  saveReviewTemplates,
} from '@/services/reviewService';

const initialFilters: FilterState = {
  batchId: '',
  anomalyTypes: [],
  reviewStatuses: [],
};

const initialAuditLogFilter: AuditLogFilter = {
  actions: [],
  operator: '',
};

const initialHandoverFilter: HandoverFilterState = {
  keyword: '',
  statuses: [],
  handedBy: '',
  receivedBy: '',
};

const initialSupplierRiskFilter: SupplierRiskFilterState = {
  timeRangeStart: '',
  timeRangeEnd: '',
  anomalyTypes: [],
  reviewStatuses: [],
  riskLevels: [],
  keyword: '',
  onlyWithPendingHandovers: false,
  onlyWithNameConflicts: false,
};

const initialReviewFilter: ReviewFilterState = INITIAL_REVIEW_FILTER;

function genAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function genHandoverId(): string {
  return `HO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

const FILE_TYPE_LABEL: Record<FileType, string> = {
  arrival: '到货清单',
  log: '温度日志',
  review: '复核记录',
};

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
        rulesPackagePreview: null,

        handoverRecords: [],
        handoverLocks: [],
        handoverFilter: initialHandoverFilter,

        supplierRiskRules: loadSupplierRiskRules(),
        supplierNameResolution: loadSupplierNameResolution(),
        supplierRiskFilter: initialSupplierRiskFilter,

        reviewTemplates: loadReviewTemplates(),
        reviewRecords: loadReviewRecords(),
        reviewFilter: initialReviewFilter,
        reviewUndoStack: [],
        pendingReviewConflicts: [],

        previewFieldMapping: async (file: File, fileType: FileType): Promise<FieldMappingPreview> => {
          const preview = await buildFieldMappingPreview(file, fileType);
          const health = preview.healthReport;
          if (health && (health.needsUserAttention || !health.isHealthy)) {
            const reasons: string[] = [];
            if (health.invalidatedSourceColumns.length > 0) {
              reasons.push(`失效字段: ${health.invalidatedSourceColumns.map((i) => i.targetField).join(',')}`);
            }
            if (health.newColumns.length > 0) {
              reasons.push(`新增列: ${health.newColumns.join(',')}`);
            }
            if (health.missingRequiredFields.length > 0) {
              reasons.push(`必填缺失: ${health.missingRequiredFields.join(',')}`);
            }
            if (health.conflictingSourceColumns.length > 0) {
              reasons.push(`同源冲突: ${health.conflictingSourceColumns.map((c) => c.sourceColumn).join(',')}`);
            }
            const mappingSnapshot: ColumnMappingSnapshot[] = preview.mappings.map((m) => ({
              targetField: m.targetField,
              sourceColumn: m.sourceColumn,
            }));
            appendAudit(
              createAuditLog(
                'import_blocked',
                get().currentReviewer || '质控员',
                `预览${FILE_TYPE_LABEL[fileType]} ${file.name} 发现映射问题：${reasons.join('；') || health.issues.map((i) => i.message).slice(0, 3).join('；')}`,
                {
                  fileName: file.name,
                  fileType,
                  headers: preview.headers,
                  invalidatedFields: health.invalidatedSourceColumns,
                  newColumns: health.newColumns,
                  missingRequiredFields: health.missingRequiredFields,
                  conflictingSourceColumns: health.conflictingSourceColumns,
                  fieldMappings: mappingSnapshot,
                },
              ),
            );
          }
          return preview;
        },

        importArrivals: async (file: File, fieldMappings?: FieldMapping[]): Promise<ImportResult> => {
        const existing = get().arrivalBatches;
        const hash = await computeFileHash(file);
        const rows = await parseCsvFile(file);
        const headers = Object.keys(rows[0] || {});
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'arrival' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        if (fieldMappings && fieldMappings.length > 0) {
          const mappingSnapshot: ColumnMappingSnapshot[] = fieldMappings.map((m) => ({
            targetField: m.targetField,
            sourceColumn: m.sourceColumn,
          }));
          const changedMappings = fieldMappings.filter((m) => !m.matchedAutomatically);
          if (changedMappings.length > 0) {
            const labels = FIELD_LABELS.arrival;
            appendAudit(
              createAuditLog(
                'field_mapping_changed',
                get().currentReviewer,
                `到货清单字段映射变更: ${changedMappings.map((m) => `${labels[m.targetField] || m.targetField} ← "${m.sourceColumn}"`).join('; ')}`,
                { fileType: 'arrival', fileName: file.name, mappings: mappingSnapshot, headers },
              ),
            );
          }
          saveFieldMappings('arrival', mappingSnapshot, headers);
        }
        const result = await parseArrivalCsv(file, existing, fieldMappings);
        if (result.missingColumns.length > 0) {
          appendAudit(
            createAuditLog(
              'import_blocked',
              get().currentReviewer,
              `导入到货清单 ${file.name} 被阻断：缺少必填列 ${result.missingColumns.join(', ')}`,
              { fileName: file.name, fileType: 'arrival', missingColumns: result.missingColumns, headers, fieldMappings: fieldMappings?.map((m) => ({ targetField: m.targetField, sourceColumn: m.sourceColumn })) },
            ),
          );
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
        const fieldMappingsForLog = fieldMappings?.map((m) => ({
          targetField: m.targetField,
          sourceColumn: m.sourceColumn,
        }));
        appendAudit(
          createAuditLog(
            'import_arrival',
            get().currentReviewer,
            `导入到货清单 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows, fieldMappings: fieldMappingsForLog, headers },
          ),
        );
        get().detectAnomalies();
        return wrapImportSuccess(record);
      },

      importTemperatureLogs: async (file: File, fieldMappings?: FieldMapping[]): Promise<ImportResult> => {
        const existing = get().temperatureLogs;
        const hash = await computeFileHash(file);
        const rows = await parseCsvFile(file);
        const headers = Object.keys(rows[0] || {});
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'log' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        if (fieldMappings && fieldMappings.length > 0) {
          const mappingSnapshot: ColumnMappingSnapshot[] = fieldMappings.map((m) => ({
            targetField: m.targetField,
            sourceColumn: m.sourceColumn,
          }));
          const changedMappings = fieldMappings.filter((m) => !m.matchedAutomatically);
          if (changedMappings.length > 0) {
            const labels = FIELD_LABELS.log;
            appendAudit(
              createAuditLog(
                'field_mapping_changed',
                get().currentReviewer,
                `温度日志字段映射变更: ${changedMappings.map((m) => `${labels[m.targetField] || m.targetField} ← "${m.sourceColumn}"`).join('; ')}`,
                { fileType: 'log', fileName: file.name, mappings: mappingSnapshot, headers },
              ),
            );
          }
          saveFieldMappings('log', mappingSnapshot, headers);
        }
        const result = await parseLogCsv(file, existing, fieldMappings);
        if (result.missingColumns.length > 0) {
          appendAudit(
            createAuditLog(
              'import_blocked',
              get().currentReviewer,
              `导入温度日志 ${file.name} 被阻断：缺少必填列 ${result.missingColumns.join(', ')}`,
              { fileName: file.name, fileType: 'log', missingColumns: result.missingColumns, headers, fieldMappings: fieldMappings?.map((m) => ({ targetField: m.targetField, sourceColumn: m.sourceColumn })) },
            ),
          );
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
        const fieldMappingsForLog = fieldMappings?.map((m) => ({
          targetField: m.targetField,
          sourceColumn: m.sourceColumn,
        }));
        appendAudit(
          createAuditLog(
            'import_log',
            get().currentReviewer,
            `导入温度日志 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows, fieldMappings: fieldMappingsForLog, headers },
          ),
        );
        get().detectAnomalies();
        return wrapImportSuccess(record);
      },

      importManualReviews: async (file: File, fieldMappings?: FieldMapping[]): Promise<ImportResult> => {
        const existing = get().manualReviews;
        const hash = await computeFileHash(file);
        const rows = await parseCsvFile(file);
        const headers = Object.keys(rows[0] || {});
        const isDuplicate = get().importRecords.some(
          (r) => r.fileType === 'review' && r.fileHash === hash,
        );
        if (isDuplicate) {
          return wrapImportError('该文件已导入，已跳过', undefined, true);
        }
        if (fieldMappings && fieldMappings.length > 0) {
          const mappingSnapshot: ColumnMappingSnapshot[] = fieldMappings.map((m) => ({
            targetField: m.targetField,
            sourceColumn: m.sourceColumn,
          }));
          const changedMappings = fieldMappings.filter((m) => !m.matchedAutomatically);
          if (changedMappings.length > 0) {
            const labels = FIELD_LABELS.review;
            appendAudit(
              createAuditLog(
                'field_mapping_changed',
                get().currentReviewer,
                `复核记录字段映射变更: ${changedMappings.map((m) => `${labels[m.targetField] || m.targetField} ← "${m.sourceColumn}"`).join('; ')}`,
                { fileType: 'review', fileName: file.name, mappings: mappingSnapshot, headers },
              ),
            );
          }
          saveFieldMappings('review', mappingSnapshot, headers);
        }
        const result = await parseReviewCsv(file, existing, fieldMappings);
        if (result.missingColumns.length > 0) {
          appendAudit(
            createAuditLog(
              'import_blocked',
              get().currentReviewer,
              `导入复核记录 ${file.name} 被阻断：缺少必填列 ${result.missingColumns.join(', ')}`,
              { fileName: file.name, fileType: 'review', missingColumns: result.missingColumns, headers, fieldMappings: fieldMappings?.map((m) => ({ targetField: m.targetField, sourceColumn: m.sourceColumn })) },
            ),
          );
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
        const fieldMappingsForLog = fieldMappings?.map((m) => ({
          targetField: m.targetField,
          sourceColumn: m.sourceColumn,
        }));
        appendAudit(
          createAuditLog(
            'import_review',
            get().currentReviewer,
            `导入复核记录 ${file.name}：有效 ${record.validRows} 行，无效 ${record.invalidRows} 行`,
            { fileName: file.name, validRows: record.validRows, invalidRows: record.invalidRows, fieldMappings: fieldMappingsForLog, headers },
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
        const fieldMappingsSnapshot: SavedFieldMappings = loadFieldMappings();

        appendAudit(
          createAuditLog(
            'export_data',
            s.currentReviewer || '未知复核人',
            `导出数据：${format.toUpperCase()}，共 ${filtered.length} 条异常${filteredAudit.length > 0 ? `，${filteredAudit.length} 条审计日志` : ''}`,
            { format, anomalyCount: filtered.length, auditLogCount: filteredAudit.length, fieldMappings: fieldMappingsSnapshot },
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
          const fieldMappingsSnapshot: SavedFieldMappings = loadFieldMappings();
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
            fieldMappingsSnapshot,
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
        saveSupplierRiskRules(DEFAULT_SUPPLIER_RISK_RULES);
        saveSupplierNameResolution({ variantToCanonical: {}, conflicts: [] });
        saveReviewTemplates(JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES)));
        saveReviewRecords([]);
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
          rulesPackagePreview: null,
          handoverRecords: [],
          handoverLocks: [],
          handoverFilter: initialHandoverFilter,
          supplierRiskRules: { ...DEFAULT_SUPPLIER_RISK_RULES },
          supplierNameResolution: { variantToCanonical: {}, conflicts: [] },
          supplierRiskFilter: initialSupplierRiskFilter,
          reviewTemplates: JSON.parse(JSON.stringify(DEFAULT_REVIEW_TEMPLATES)),
          reviewRecords: [],
          reviewFilter: initialReviewFilter,
          reviewUndoStack: [],
          pendingReviewConflicts: [],
        });
      },

      exportRulesPackage: () => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        appendAudit(
          createAuditLog(
            'export_rules_package',
            reviewer,
            '导出复核规则配置包',
            { reviewRules: s.reviewRules },
          ),
        );
        exportRulesPackageFile(s.reviewRules, reviewer);
      },

      previewRulesPackage: async (file: File): Promise<RulesPackagePreviewResult> => {
        const s = get();
        const result = await previewRulesPackageService(file, s.reviewRules);
        if (result.preview) {
          set({ rulesPackagePreview: result.preview });
        }
        return result;
      },

      applyRulesPackage: (confirmed: boolean): RulesPackageApplyResult => {
        const s = get();
        const preview = s.rulesPackagePreview;

        if (!preview) {
          return { success: false, message: '没有待确认的规则包预览，请先选择文件' };
        }
        if (!preview.canApply) {
          return { success: false, message: '规则包存在阻断性问题，无法应用' };
        }
        if (preview.hasConflicts && !confirmed) {
          return {
            success: false,
            message: `检测到 ${preview.diffs.length} 处与当前规则不同，请确认后应用`,
          };
        }

        const before = s.reviewRules;
        const after = preview.packageData.rules;
        const reviewer = s.currentReviewer || '未知复核人';
        const changes = preview.diffs.map(
          (d) => `${d.field}: ${d.currentValue} → ${d.importedValue}`,
        );

        set({ reviewRules: after, rulesPackagePreview: null });

        appendAudit(
          createAuditLog(
            'import_rules_package',
            reviewer,
            `导入规则配置包 ${preview.fileName}：${changes.join('；') || '无变更'}`,
            {
              fileName: preview.fileName,
              before,
              after,
              changes,
              packageVersion: preview.packageData.version,
              exportedBy: preview.packageData.exportedBy,
              exportedAt: preview.packageData.exportedAt,
            },
          ),
        );

        get().detectAnomalies();

        return {
          success: true,
          message: changes.length > 0
            ? `规则已更新：${changes.length} 处变更`
            : '规则与当前配置一致，无需变更',
          appliedRules: after,
          beforeRules: before,
        };
      },

      clearRulesPackagePreview: () => {
        set({ rulesPackagePreview: null });
      },

      setHandoverFilter: (filters: Partial<HandoverFilterState>) =>
        set((s) => ({ handoverFilter: { ...s.handoverFilter, ...filters } })),

      createHandover: (params) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        if (!params.receivedBy.trim()) return null;
        if (params.anomalyIds.length === 0) return null;

        const items: HandoverItemSnapshot[] = [];
        for (const aid of params.anomalyIds) {
          const anomaly = s.anomalies.find((a) => a.id === aid);
          if (!anomaly) continue;
          const decision = s.reviewDecisions[anomaly.batchId];
          items.push({
            anomalyId: anomaly.id,
            batchId: anomaly.batchId,
            anomalyType: anomaly.type,
            severity: anomaly.severity,
            description: anomaly.description,
            sourceRows: anomaly.sourceRows,
            originalConclusion: decision?.conclusion ?? 'unreviewed',
            originalReviewer: decision?.reviewer,
            originalRemark: decision?.remark,
            rulesSnapshot: { ...s.reviewRules },
          });
        }
        if (items.length === 0) return null;

        const record: HandoverRecord = {
          id: genHandoverId(),
          title: params.title.trim() || `交接清单 ${new Date().toLocaleString('zh-CN')}`,
          items,
          handedBy: reviewer,
          receivedBy: params.receivedBy.trim(),
          remark: params.remark,
          deadline: params.deadline,
          status: 'pending',
          createdAt: new Date().toISOString(),
          version: 1,
        };

        set((st) => ({ handoverRecords: [record, ...st.handoverRecords] }));
        appendAudit(
          createAuditLog(
            'create_handover',
            reviewer,
            `创建交接清单 ${record.id}：${items.length} 条异常，交接给 ${record.receivedBy}，截止 ${record.deadline}`,
            {
              handoverId: record.id,
              itemCount: items.length,
              receivedBy: record.receivedBy,
              deadline: record.deadline,
              title: record.title,
            },
          ),
        );
        return record;
      },

      acceptHandover: (handoverId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.handoverRecords.find((h) => h.id === handoverId);
        if (!record) return { success: false, message: '交接记录不存在' };
        if (record.receivedBy !== reviewer) {
          return { success: false, message: `该交接任务的接收人是 ${record.receivedBy}，您无权接收` };
        }
        if (record.status !== 'pending' && record.status !== 'returned') {
          return { success: false, message: `当前状态 ${record.status} 不可接收` };
        }

        set((st) => ({
          handoverRecords: st.handoverRecords.map((h) =>
            h.id === handoverId
              ? {
                  ...h,
                  status: 'accepted',
                  acceptedAt: new Date().toISOString(),
                  lastUpdatedBy: reviewer,
                  lastUpdatedAt: new Date().toISOString(),
                  version: h.version + 1,
                }
              : h,
          ),
        }));
        appendAudit(
          createAuditLog(
            'accept_handover',
            reviewer,
            `接收交接任务 ${handoverId}`,
            { handoverId, itemCount: record.items.length },
          ),
        );
        return { success: true, message: '已成功接收交接任务' };
      },

      returnHandover: (handoverId, reason) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.handoverRecords.find((h) => h.id === handoverId);
        if (!record) return { success: false, message: '交接记录不存在' };
        if (record.receivedBy !== reviewer) {
          return { success: false, message: `该交接任务的接收人是 ${record.receivedBy}，您无权退回` };
        }
        if (record.status !== 'accepted') {
          return { success: false, message: `当前状态 ${record.status} 不可退回` };
        }

        set((st) => ({
          handoverRecords: st.handoverRecords.map((h) =>
            h.id === handoverId
              ? {
                  ...h,
                  status: 'returned',
                  returnReason: reason,
                  returnedAt: new Date().toISOString(),
                  lastUpdatedBy: reviewer,
                  lastUpdatedAt: new Date().toISOString(),
                  version: h.version + 1,
                }
              : h,
          ),
          handoverLocks: st.handoverLocks.filter((l) => l.handoverId !== handoverId),
        }));
        appendAudit(
          createAuditLog(
            'return_handover',
            reviewer,
            `退回交接任务 ${handoverId}，原因：${reason || '未填写'}`,
            { handoverId, reason, itemCount: record.items.length },
          ),
        );
        return { success: true, message: '已退回交接任务' };
      },

      completeHandover: (handoverId, remark, decisions) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.handoverRecords.find((h) => h.id === handoverId);
        if (!record) return { success: false, message: '交接记录不存在' };
        if (record.receivedBy !== reviewer) {
          return { success: false, message: `该交接任务的接收人是 ${record.receivedBy}，您无权完成` };
        }
        if (record.status !== 'accepted') {
          return { success: false, message: `当前状态 ${record.status} 不可完成` };
        }

        for (const d of decisions) {
          get().setReviewDecision(d.batchId, d.conclusion, d.remark || remark || '交接复核完成');
        }

        set((st) => ({
          handoverRecords: st.handoverRecords.map((h) =>
            h.id === handoverId
              ? {
                  ...h,
                  status: 'completed',
                  completedRemark: remark,
                  completedAt: new Date().toISOString(),
                  lastUpdatedBy: reviewer,
                  lastUpdatedAt: new Date().toISOString(),
                  version: h.version + 1,
                }
              : h,
          ),
          handoverLocks: st.handoverLocks.filter((l) => l.handoverId !== handoverId),
        }));
        appendAudit(
          createAuditLog(
            'complete_handover',
            reviewer,
            `完成交接任务 ${handoverId}：${decisions.length} 条复核，${remark ? `备注：${remark}` : ''}`,
            { handoverId, remark, decisionsCount: decisions.length, itemCount: record.items.length },
          ),
        );
        return { success: true, message: '已完成交接任务并提交复核结论' };
      },

      acquireItemLock: (handoverId, anomalyId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const existing = s.handoverLocks.find(
          (l) => l.handoverId === handoverId && l.itemAnomalyId === anomalyId,
        );
        if (existing) {
          if (existing.lockedBy === reviewer) {
            return { success: true, message: '您已锁定该条目' };
          }
          appendAudit(
            createAuditLog(
              'handover_conflict',
              reviewer,
              `尝试编辑交接 ${handoverId} 条目 ${anomalyId}，被 ${existing.lockedBy} 锁定`,
              { handoverId, anomalyId, lockedBy: existing.lockedBy, lockedAt: existing.lockedAt },
            ),
          );
          return {
            success: false,
            message: `该条目正在被 ${existing.lockedBy} 处理，请稍后再试`,
            lockedBy: existing.lockedBy,
          };
        }
        const lock: HandoverLock = {
          handoverId,
          itemAnomalyId: anomalyId,
          lockedBy: reviewer,
          lockedAt: new Date().toISOString(),
        };
        set((st) => ({ handoverLocks: [...st.handoverLocks, lock] }));
        return { success: true, message: '已锁定' };
      },

      releaseItemLock: (handoverId, anomalyId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        set((st) => ({
          handoverLocks: st.handoverLocks.filter(
            (l) =>
              !(l.handoverId === handoverId && l.itemAnomalyId === anomalyId && l.lockedBy === reviewer),
          ),
        }));
      },

      exportHandoverData: (format, handoverIds) => {
        const s = get();
        let records = s.handoverRecords;
        if (handoverIds && handoverIds.length > 0) {
          records = records.filter((h) => handoverIds.includes(h.id));
        } else {
          records = applyHandoverFilters(records, s.handoverFilter);
        }
        const exportTime = new Date().toISOString();
        const ts = exportTime.replace(/[:.]/g, '-').slice(0, 19);
        const reviewer = s.currentReviewer || '未知复核人';

        appendAudit(
          createAuditLog(
            'export_data',
            reviewer,
            `导出交接记录：${format.toUpperCase()}，共 ${records.length} 条`,
            { format, handoverCount: records.length, handoverIds: handoverIds ?? null },
          ),
        );

        if (format === 'csv') {
          const content = buildHandoverExportCsv(records);
          downloadFile(content, `cold-chain-handovers-${ts}.csv`, 'text/csv;charset=utf-8');
        } else {
          const content = buildHandoverExportJson(records, exportTime);
          downloadFile(content, `cold-chain-handovers-${ts}.json`, 'application/json');
        }
      },

      computeSupplierRiskProfiles: (): SupplierRiskProfile[] => {
        const s = get();
        const profiles = buildSupplierRiskProfiles({
          batches: s.arrivalBatches,
          anomalies: s.anomalies,
          logs: s.temperatureLogs,
          reviews: s.manualReviews,
          decisions: s.reviewDecisions,
          handoverRecords: s.handoverRecords,
          nameResolution: s.supplierNameResolution,
          riskRules: s.supplierRiskRules,
        });
        return filterSupplierRiskProfiles(
          profiles,
          s.supplierRiskFilter,
          s.arrivalBatches,
          s.reviewDecisions,
        );
      },

      setSupplierRiskRules: (rules: Partial<SupplierRiskRules> | SupplierRiskLevelRule[]) => {
        const s = get();
        const before = s.supplierRiskRules;
        let merged: SupplierRiskRules;
        if (Array.isArray(rules)) {
          merged = { ...before, levels: rules };
        } else {
          merged = { ...before, ...rules };
        }
        set({ supplierRiskRules: merged });
        saveSupplierRiskRules(merged);

        const changes: string[] = [];
        if (Array.isArray(rules)) {
          changes.push(`等级规则已更新，共 ${rules.length} 级`);
        } else {
          for (const k of Object.keys(rules) as (keyof SupplierRiskRules)[]) {
            if (k === 'levels') continue;
            const bv = before[k];
            const mv = merged[k];
            if (bv !== mv) changes.push(`${k}: ${bv} → ${mv}`);
          }
        }
        if (changes.length > 0) {
          appendAudit(
            createAuditLog(
              'change_supplier_risk_rules',
              s.currentReviewer || '未知复核人',
              `供应商风险规则变更：${changes.join('；')}`,
              { before, after: merged, changes },
            ),
          );
        }
      },

      resetSupplierRiskRules: () => {
        const s = get();
        const before = s.supplierRiskRules;
        const reset = { ...DEFAULT_SUPPLIER_RISK_RULES, levels: DEFAULT_SUPPLIER_RISK_RULES.levels.map((l) => ({ ...l, conditions: { ...l.conditions } })) };
        set({ supplierRiskRules: reset });
        saveSupplierRiskRules(reset);
        appendAudit(
          createAuditLog(
            'change_supplier_risk_rules',
            s.currentReviewer || '未知复核人',
            '供应商风险规则已恢复默认值',
            { before, after: reset },
          ),
        );
      },

      setSupplierRiskFilter: (filters: Partial<SupplierRiskFilterState>) =>
        set((s) => ({ supplierRiskFilter: { ...s.supplierRiskFilter, ...filters } })),

      resolveSupplierNameConflict: (conflictId: string, merge: boolean, canonicalName?: string) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const resolution = s.supplierNameResolution;
        const conflict = resolution.conflicts.find((c) => c.id === conflictId);
        if (!conflict) return;

        const newResolution: SupplierNameResolutionMap = {
          ...resolution,
          variantToCanonical: { ...resolution.variantToCanonical },
          conflicts: resolution.conflicts.map((c) => {
            if (c.id !== conflictId) return c;
            const mergedTo = merge ? (canonicalName || c.variants[0]) : undefined;
            return {
              ...c,
              resolved: true,
              mergedTo,
              resolvedAt: new Date().toISOString(),
              resolvedBy: reviewer,
            };
          }),
        };

        if (merge) {
          const target = canonicalName || conflict.variants[0];
          for (const variant of conflict.variants) {
            const normalized = normalizeSupplierName(variant);
            newResolution.variantToCanonical[normalized] = target;
          }
        }

        set({ supplierNameResolution: newResolution });
        saveSupplierNameResolution(newResolution);

        appendAudit(
          createAuditLog(
            merge ? 'supplier_name_merge_confirmed' : 'supplier_name_merge_kept_separate',
            reviewer,
            merge
              ? `已合并供应商名称冲突：${conflict.variants.join(' / ')} → ${canonicalName || conflict.variants[0]}`
              : `已确认保留独立供应商：${conflict.variants.join(' / ')}`,
            {
              conflictId,
              normalizedKey: conflict.normalizedKey,
              variants: conflict.variants,
              merge,
              mergedTo: canonicalName,
            },
          ),
        );
      },

      exportSupplierRiskData: (format, profiles) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const data = profiles ?? s.computeSupplierRiskProfiles();
        const exportTime = new Date().toISOString();
        const ts = exportTime.replace(/[:.]/g, '-').slice(0, 19);

        const ctx = {
          filterSnapshot: s.supplierRiskFilter,
          rulesSnapshot: s.supplierRiskRules,
          nameResolutionSnapshot: s.supplierNameResolution,
          auditLogs: s.auditLogs.filter(
            (l) =>
              l.action.startsWith('change_supplier') ||
              l.action.startsWith('supplier_name') ||
              l.action === 'export_supplier_risk',
          ).slice(0, 100),
          exportTime,
          exportedBy: reviewer,
        };

        appendAudit(
          createAuditLog(
            'export_supplier_risk',
            reviewer,
            `导出供应商风险画像：${format.toUpperCase()}，共 ${data.length} 个供应商`,
            { format, profileCount: data.length },
          ),
        );

        if (format === 'csv') {
          const content = buildSupplierRiskExportCsv(data, ctx);
          downloadFile(content, `supplier-risk-${ts}.csv`, 'text/csv;charset=utf-8');
        } else {
          const content = buildSupplierRiskExportJson(data, ctx);
          downloadFile(content, `supplier-risk-${ts}.json`, 'application/json');
        }
      },

      setReviewFilter: (filters) =>
        set((s) => ({ reviewFilter: { ...s.reviewFilter, ...filters } })),

      saveReviewTemplate: (template) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const now = new Date().toISOString();
        const existing = s.reviewTemplates.find((t) => t.id === template.id);
        const toSave: ReviewTemplate = existing
          ? { ...template, updatedAt: now }
          : { ...template, createdAt: now, updatedAt: now };
        const next = existing
          ? s.reviewTemplates.map((t) => (t.id === template.id ? toSave : t))
          : [...s.reviewTemplates, toSave];
        set({ reviewTemplates: next });
        saveReviewTemplates(next);
        appendAudit(
          createAuditLog(
            'review_template_update',
            reviewer,
            existing ? `更新复盘模板：${template.name}` : `创建复盘模板：${template.name}`,
            { templateId: template.id, templateName: template.name },
          ),
        );
      },

      deleteReviewTemplate: (templateId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const tpl = s.reviewTemplates.find((t) => t.id === templateId);
        if (!tpl) return;
        if (tpl.id === 'tpl-default') return;
        const next = s.reviewTemplates.filter((t) => t.id !== templateId);
        set({ reviewTemplates: next });
        saveReviewTemplates(next);
        appendAudit(
          createAuditLog(
            'review_template_update',
            reviewer,
            `删除复盘模板：${tpl.name}`,
            { templateId, templateName: tpl.name },
          ),
        );
      },

      createReview: (params) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        if (params.batchIds.length === 0) return null;
        const template =
          s.reviewTemplates.find((t) => t.id === params.templateId) ||
          s.reviewTemplates[0] ||
          DEFAULT_REVIEW_TEMPLATES[0];
        const record = buildReviewRecord({
          title: params.title,
          batchIds: params.batchIds,
          batches: s.arrivalBatches,
          logs: s.temperatureLogs,
          anomalies: s.anomalies,
          reviews: s.manualReviews,
          decisions: s.reviewDecisions,
          handovers: s.handoverRecords,
          supplierProfiles: s.computeSupplierRiskProfiles(),
          template,
          createdBy: reviewer,
          filtersSnapshot: s.filters as unknown as Record<string, unknown>,
          initialSeverity: params.initialSeverity,
        });
        const conflicts = detectReviewConflicts(record, s.reviewRecords);
        set((st) => ({
          reviewRecords: [record, ...st.reviewRecords],
          pendingReviewConflicts: conflicts,
        }));
        saveReviewRecords([record, ...s.reviewRecords]);
        appendAudit(
          createAuditLog(
            'review_create',
            reviewer,
            `创建复盘单 ${record.id}：${record.title}，批次 ${params.batchIds.join(', ')}`,
            { reviewId: record.id, batchIds: params.batchIds, templateId: template.id },
          ),
        );
        return record;
      },

      updateReviewNode: (reviewId, nodeId, patch) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.reviewRecords.find((r) => r.id === reviewId);
        if (!record) return;
        const node = record.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const snapshot = {
          reviewId,
          previousNodes: JSON.parse(JSON.stringify(record.nodes)),
          previousLogs: JSON.parse(JSON.stringify(record.logs)),
        };

        const now = new Date().toISOString();
        const updatedNode: ReviewNode = { ...node, ...patch, updatedAt: now };
        const changedFields: string[] = [];
        for (const k of Object.keys(patch) as Array<keyof ReviewNode>) {
          if (JSON.stringify(node[k]) !== JSON.stringify(patch[k])) {
            changedFields.push(k);
          }
        }

        const logEntry = createReviewLog(
          'node_update',
          reviewer,
          `编辑节点 ${node.title}（${node.nodeType}），变更字段：${changedFields.join(', ') || '无'}`,
          { nodeId, nodeType: node.nodeType, changedFields },
        );

        const updated: ReviewRecord = {
          ...record,
          nodes: record.nodes.map((n) => (n.id === nodeId ? updatedNode : n)),
          logs: [...record.logs, logEntry],
          updatedAt: now,
        };

        set((st) => ({
          reviewRecords: st.reviewRecords.map((r) => (r.id === reviewId ? updated : r)),
          reviewUndoStack: [...st.reviewUndoStack.slice(-19), snapshot],
        }));
        saveReviewRecords(s.reviewRecords.map((r) => (r.id === reviewId ? updated : r)));
        appendAudit(
          createAuditLog(
            'review_node_edit',
            reviewer,
            `复盘单 ${reviewId} 节点编辑：${node.title}`,
            { reviewId, nodeId, nodeType: node.nodeType, changedFields },
          ),
        );
      },

      undoLastReviewNodeEdit: (reviewId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const stack = s.reviewUndoStack.filter((u) => u.reviewId === reviewId);
        if (stack.length === 0) {
          return { success: false, message: '没有可撤销的编辑' };
        }
        const last = stack[stack.length - 1];
        const record = s.reviewRecords.find((r) => r.id === reviewId);
        if (!record) return { success: false, message: '复盘单不存在' };

        const logEntry = createReviewLog(
          'node_update',
          reviewer,
          `撤销节点编辑，恢复到上一版本`,
          {},
        );

        const restored: ReviewRecord = {
          ...record,
          nodes: last.previousNodes,
          logs: [...last.previousLogs, logEntry],
          updatedAt: new Date().toISOString(),
        };

        set((st) => ({
          reviewRecords: st.reviewRecords.map((r) => (r.id === reviewId ? restored : r)),
          reviewUndoStack: st.reviewUndoStack.slice(0, -1),
        }));
        saveReviewRecords(s.reviewRecords.map((r) => (r.id === reviewId ? restored : r)));
        appendAudit(
          createAuditLog(
            'review_node_undo',
            reviewer,
            `复盘单 ${reviewId} 撤销节点编辑`,
            { reviewId },
          ),
        );
        return { success: true, message: '已撤销最近一次节点编辑' };
      },

      setReviewStatus: (reviewId, status) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.reviewRecords.find((r) => r.id === reviewId);
        if (!record) return;
        const now = new Date().toISOString();
        const logEntry = createReviewLog(
          'review_status_change',
          reviewer,
          `状态变更：${record.status} → ${status}`,
          { fromStatus: record.status, toStatus: status },
        );
        const updated: ReviewRecord = {
          ...record,
          status,
          logs: [...record.logs, logEntry],
          updatedAt: now,
          completedAt: status === 'completed' ? now : record.completedAt,
        };
        set((st) => ({
          reviewRecords: st.reviewRecords.map((r) => (r.id === reviewId ? updated : r)),
        }));
        saveReviewRecords(s.reviewRecords.map((r) => (r.id === reviewId ? updated : r)));
        appendAudit(
          createAuditLog(
            'review_status_change',
            reviewer,
            `复盘单 ${reviewId} 状态变更：${record.status} → ${status}`,
            { reviewId, fromStatus: record.status, toStatus: status },
          ),
        );
      },

      deleteReview: (reviewId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const record = s.reviewRecords.find((r) => r.id === reviewId);
        if (!record) return;
        const next = s.reviewRecords.filter((r) => r.id !== reviewId);
        set({ reviewRecords: next });
        saveReviewRecords(next);
        appendAudit(
          createAuditLog(
            'review_update',
            reviewer,
            `删除复盘单 ${reviewId}：${record.title}`,
            { reviewId, title: record.title },
          ),
        );
      },

      resolvePendingReviewConflict: (conflictId, optionKey, targetReviewId) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        const conflict = s.pendingReviewConflicts.find((c) => c.id === conflictId);
        if (!conflict) return;
        const target = s.reviewRecords.find((r) => r.id === targetReviewId);
        if (!target) return;

        const { allRecords } = resolveConflict(
          target,
          conflict,
          optionKey,
          reviewer,
          s.reviewRecords,
          s.reviewTemplates,
        );

        set((st) => ({
          reviewRecords: allRecords,
          pendingReviewConflicts: st.pendingReviewConflicts.filter((c) => c.id !== conflictId),
        }));
        saveReviewRecords(allRecords);
        appendAudit(
          createAuditLog(
            'review_conflict_resolved',
            reviewer,
            `复盘冲突处理：${conflict.type} → ${optionKey}`,
            { conflictId, conflictType: conflict.type, option: optionKey, reviewId: targetReviewId },
          ),
        );
      },

      clearPendingReviewConflicts: () => set({ pendingReviewConflicts: [] }),

      exportReviewData: (format, reviewIds) => {
        const s = get();
        const reviewer = s.currentReviewer || '未知复核人';
        let records = s.reviewRecords;
        if (reviewIds && reviewIds.length > 0) {
          records = records.filter((r) => reviewIds.includes(r.id));
        } else {
          records = applyReviewFilters(records, s.reviewFilter);
        }
        const exportTime = new Date().toISOString();
        const ts = exportTime.replace(/[:.]/g, '-').slice(0, 19);
        const ctx = {
          filterSnapshot: s.reviewFilter,
          templatesSnapshot: s.reviewTemplates,
          exportedAt: exportTime,
          exportedBy: reviewer,
        };
        appendAudit(
          createAuditLog(
            'review_export',
            reviewer,
            `导出复盘数据：${format.toUpperCase()}，共 ${records.length} 条复盘单`,
            { format, reviewCount: records.length, reviewIds: reviewIds ?? null },
          ),
        );
        if (format === 'csv') {
          const content = buildReviewExportCsv(records, ctx);
          downloadFile(content, `review-workbench-${ts}.csv`, 'text/csv;charset=utf-8');
        } else {
          const content = buildReviewExportJson(records, ctx);
          downloadFile(content, `review-workbench-${ts}.json`, 'application/json');
        }
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
        rulesPackagePreview: state.rulesPackagePreview,
        handoverRecords: state.handoverRecords,
        handoverLocks: state.handoverLocks,
        handoverFilter: state.handoverFilter,
        supplierRiskFilter: state.supplierRiskFilter,
        reviewFilter: state.reviewFilter,
        reviewUndoStack: state.reviewUndoStack,
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

export function applyHandoverFilters(
  records: HandoverRecord[],
  filters: HandoverFilterState,
): HandoverRecord[] {
  return records.filter((h) => {
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      if (
        !h.id.toLowerCase().includes(kw) &&
        !h.title.toLowerCase().includes(kw) &&
        !h.handedBy.toLowerCase().includes(kw) &&
        !h.receivedBy.toLowerCase().includes(kw) &&
        !h.remark.toLowerCase().includes(kw)
      ) {
        return false;
      }
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(h.status)) return false;
    if (filters.handedBy && !h.handedBy.toLowerCase().includes(filters.handedBy.toLowerCase())) return false;
    if (filters.receivedBy && !h.receivedBy.toLowerCase().includes(filters.receivedBy.toLowerCase())) return false;
    return true;
  });
}

export function getHandoverMetrics(
  records: HandoverRecord[],
  currentReviewer: string,
) {
  const myPending = records.filter(
    (h) => h.receivedBy === currentReviewer && (h.status === 'pending' || h.status === 'returned'),
  ).length;
  const myAccepted = records.filter(
    (h) => h.receivedBy === currentReviewer && h.status === 'accepted',
  ).length;
  const myCompleted = records.filter(
    (h) => h.receivedBy === currentReviewer && h.status === 'completed',
  ).length;
  const createdByMe = records.filter((h) => h.handedBy === currentReviewer).length;
  return {
    total: records.length,
    myPending,
    myAccepted,
    myCompleted,
    createdByMe,
  };
}

export { applyReviewFilters, getReviewMetrics };
