export const PERSIST_STORAGE_KEY = 'cold-chain-dashboard-v2';

export const RULES_PACKAGE_VERSION = 1;

export type FileType = 'arrival' | 'log' | 'review';

export type AnomalyType = 'overtemp' | 'missing_log' | 'unregistered' | 'review_conflict';

export type AnomalySeverity = 'warning' | 'danger';

export type ReviewConclusion = 'release' | 'quarantine' | 'ignore' | 'unreviewed';

export interface ReviewRules {
  overtempThreshold: number;
  missingLogIntervalMin: number;
  overtempDurationDangerMin: number;
  overtempDeltaDanger: number;
  missingLogGapDangerMin: number;
}

export const DEFAULT_REVIEW_RULES: ReviewRules = {
  overtempThreshold: 0,
  missingLogIntervalMin: 30,
  overtempDurationDangerMin: 30,
  overtempDeltaDanger: 5,
  missingLogGapDangerMin: 120,
};

export type AuditAction =
  | 'import_arrival'
  | 'import_log'
  | 'import_review'
  | 'import_blocked'
  | 'field_mapping_changed'
  | 'load_sample'
  | 'change_rules'
  | 'review_decision'
  | 'undo_review'
  | 'clear_all'
  | 'export_data'
  | 'export_rules_package'
  | 'import_rules_package'
  | 'create_handover'
  | 'accept_handover'
  | 'return_handover'
  | 'complete_handover'
  | 'handover_conflict';

export interface AuditLog {
  id: string;
  action: AuditAction;
  operator: string;
  timestamp: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewHistoryEntry {
  id: string;
  batchId: string;
  conclusion: ReviewConclusion;
  reviewer: string;
  remark: string;
  updatedAt: string;
}

export interface ArrivalBatch {
  batchId: string;
  productName: string;
  arrivalTime: string;
  requiredTempMin: number;
  requiredTempMax: number;
  supplier?: string;
  quantity?: number;
  sourceRow: number;
  sourceFile: string;
}

export interface TemperatureLog {
  id: string;
  batchId: string;
  timestamp: string;
  temperature: number;
  rawValue: string;
  sourceRow: number;
  sourceFile: string;
  isValid: boolean;
  invalidReason?: string;
}

export interface ManualReviewRecord {
  id: string;
  batchId: string;
  reviewer: string;
  conclusion: ReviewConclusion;
  remark?: string;
  reviewTime: string;
  sourceRow: number;
  sourceFile: string;
}

export interface OvertimeInterval {
  startTime: string;
  endTime: string;
  maxTemp: number;
  minTemp: number;
  durationMin: number;
  logRows: number[];
}

export interface MissingLogSegment {
  expectedStartTime: string;
  expectedEndTime: string;
  gapMin: number;
}

export interface ReviewConflictItem {
  existingConclusion: ReviewConclusion;
  existingReviewer?: string;
  existingTime?: string;
  importedConclusion: ReviewConclusion;
  importedReviewer: string;
  importedTime: string;
  sourceRow: number;
}

export interface AnomalyDetail {
  overtimeIntervals?: OvertimeInterval[];
  missingSegments?: MissingLogSegment[];
  conflictItems?: ReviewConflictItem[];
  unregisteredSource?: FileType;
}

export interface Anomaly {
  id: string;
  batchId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  detail: AnomalyDetail;
  sourceRows: number[];
}

export interface ReviewDecision {
  batchId: string;
  conclusion: ReviewConclusion;
  reviewer: string;
  remark: string;
  updatedAt: string;
}

export interface InvalidRowDetail {
  row: number;
  reason: string;
  raw?: Record<string, unknown>;
}

export interface ImportRecord {
  id: string;
  fileType: FileType;
  fileName: string;
  fileHash?: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedAt: string;
  invalidDetails: InvalidRowDetail[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  record?: ImportRecord;
  missingColumns?: string[];
  skipped?: boolean;
}

export interface FilterState {
  batchId: string;
  anomalyTypes: AnomalyType[];
  reviewStatuses: ReviewConclusion[];
}

export type AuditLogFilter = {
  actions: AuditAction[];
  operator: string;
};

export interface RulesPackageApplyResult {
  success: boolean;
  message: string;
  appliedRules?: ReviewRules;
  beforeRules?: ReviewRules;
}

export type HandoverStatus = 'pending' | 'accepted' | 'returned' | 'completed';

export interface HandoverItemSnapshot {
  anomalyId: string;
  batchId: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  sourceRows: number[];
  originalConclusion: ReviewConclusion;
  originalReviewer?: string;
  originalRemark?: string;
  rulesSnapshot: ReviewRules;
}

export interface HandoverRecord {
  id: string;
  title: string;
  items: HandoverItemSnapshot[];
  handedBy: string;
  receivedBy: string;
  remark: string;
  deadline: string;
  status: HandoverStatus;
  returnReason?: string;
  completedRemark?: string;
  createdAt: string;
  acceptedAt?: string;
  returnedAt?: string;
  completedAt?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  version: number;
}

export interface HandoverLock {
  handoverId: string;
  itemAnomalyId: string;
  lockedBy: string;
  lockedAt: string;
}

export interface HandoverFilterState {
  keyword: string;
  statuses: HandoverStatus[];
  handedBy: string;
  receivedBy: string;
}

export interface RuleFieldRange {
  min: number;
  max: number;
}

export interface AppState {
  arrivalBatches: ArrivalBatch[];
  temperatureLogs: TemperatureLog[];
  manualReviews: ManualReviewRecord[];
  anomalies: Anomaly[];
  reviewDecisions: Record<string, ReviewDecision>;
  reviewHistory: Record<string, ReviewHistoryEntry[]>;
  importRecords: ImportRecord[];
  auditLogs: AuditLog[];
  reviewRules: ReviewRules;

  currentReviewer: string;
  filters: FilterState;
  auditLogFilter: AuditLogFilter;
  selectedBatchId: string | null;

  handoverRecords: HandoverRecord[];
  handoverLocks: HandoverLock[];
  handoverFilter: HandoverFilterState;

  importArrivals: (file: File, fieldMappings?: FieldMapping[]) => Promise<ImportResult>;
  importTemperatureLogs: (file: File, fieldMappings?: FieldMapping[]) => Promise<ImportResult>;
  importManualReviews: (file: File, fieldMappings?: FieldMapping[]) => Promise<ImportResult>;
  previewFieldMapping: (file: File, fileType: FileType) => Promise<FieldMappingPreview>;
  loadSampleData: () => void;
  detectAnomalies: () => void;
  setReviewDecision: (batchId: string, conclusion: ReviewConclusion, remark: string) => void;
  undoReviewDecision: (batchId: string) => void;
  setReviewRules: (rules: Partial<ReviewRules>) => void;
  resetReviewRules: () => void;
  setCurrentReviewer: (name: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setAuditLogFilter: (filters: Partial<AuditLogFilter>) => void;
  setSelectedBatchId: (batchId: string | null) => void;
  exportData: (format: 'json' | 'csv') => void;
  clearAll: () => void;

  rulesPackagePreview: RulesPackagePreviewState | null;
  exportRulesPackage: () => void;
  previewRulesPackage: (file: File) => Promise<RulesPackagePreviewResult>;
  applyRulesPackage: (confirmed: boolean) => RulesPackageApplyResult;
  clearRulesPackagePreview: () => void;

  createHandover: (params: {
    title: string;
    anomalyIds: string[];
    receivedBy: string;
    remark: string;
    deadline: string;
  }) => HandoverRecord | null;
  acceptHandover: (handoverId: string) => { success: boolean; message: string };
  returnHandover: (handoverId: string, reason: string) => { success: boolean; message: string };
  completeHandover: (handoverId: string, remark: string, decisions: Array<{ batchId: string; conclusion: ReviewConclusion; remark: string }>) => { success: boolean; message: string };
  setHandoverFilter: (filters: Partial<HandoverFilterState>) => void;
  acquireItemLock: (handoverId: string, anomalyId: string) => { success: boolean; message: string; lockedBy?: string };
  releaseItemLock: (handoverId: string, anomalyId: string) => void;
  exportHandoverData: (format: 'json' | 'csv', handoverIds?: string[]) => void;
}

export const REVIEW_RULES_RANGES: Record<keyof ReviewRules, RuleFieldRange> = {
  overtempThreshold: { min: 0, max: 20 },
  missingLogIntervalMin: { min: 1, max: 600 },
  overtempDurationDangerMin: { min: 1, max: 600 },
  overtempDeltaDanger: { min: 0.5, max: 50 },
  missingLogGapDangerMin: { min: 5, max: 1440 },
};

export const REVIEW_RULES_LABELS: Record<keyof ReviewRules, string> = {
  overtempThreshold: '超温判定阈值(°C)',
  missingLogIntervalMin: '日志缺失间隔(分钟)',
  overtempDurationDangerMin: '超温时长严重边界(分钟)',
  overtempDeltaDanger: '超温偏差严重边界(°C)',
  missingLogGapDangerMin: '缺日志严重边界(分钟)',
};

export interface RulesPackage {
  packageType: 'review-rules';
  version: number;
  exportedAt: string;
  exportedBy?: string;
  rules: ReviewRules;
  description?: string;
}

export type RuleValidationIssueType =
  | 'missing_field'
  | 'non_numeric'
  | 'out_of_range'
  | 'version_incompatible';

export interface RuleValidationIssue {
  field?: keyof ReviewRules;
  type: RuleValidationIssueType;
  message: string;
}

export interface RuleDiffItem {
  field: keyof ReviewRules;
  currentValue: number;
  importedValue: number;
  range: RuleFieldRange;
}

export interface RulesPackagePreviewState {
  fileName: string;
  packageData: RulesPackage;
  diffs: RuleDiffItem[];
  issues: RuleValidationIssue[];
  hasConflicts: boolean;
  canApply: boolean;
  timestamp: string;
}

export interface RulesPackagePreviewResult {
  success: boolean;
  message: string;
  preview?: RulesPackagePreviewState;
  issues?: RuleValidationIssue[];
}

export interface FieldMapping {
  targetField: string;
  sourceColumn: string | null;
  isRequired: boolean;
  matchedAutomatically: boolean;
  matchReason?: string;
}

export interface ColumnMappingSnapshot {
  targetField: string;
  sourceColumn: string | null;
}

export interface FieldMappingPreview {
  fileType: FileType;
  fileName: string;
  headers: string[];
  previewRows: Record<string, unknown>[];
  mappings: FieldMapping[];
  conflicts: string[];
  missingRequired: string[];
  invalidMappings: string[];
  canProceed: boolean;
  savedMappingAvailable: boolean;
  savedMappingOutdated: boolean;
  outdatedFields?: string[];
  mappingSnapshot?: ColumnMappingSnapshot[];
}

export interface SavedFieldMappings {
  arrival?: ColumnMappingSnapshot[];
  log?: ColumnMappingSnapshot[];
  review?: ColumnMappingSnapshot[];
  updatedAt?: string;
}

export const FIELD_LABELS: Record<FileType, Record<string, string>> = {
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

export const FIELD_ALIASES: Record<FileType, Record<string, string[]>> = {
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
