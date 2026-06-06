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
  | 'load_sample'
  | 'change_rules'
  | 'review_decision'
  | 'undo_review'
  | 'clear_all'
  | 'export_data'
  | 'export_rules_package'
  | 'import_rules_package';

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

  importArrivals: (file: File) => Promise<ImportResult>;
  importTemperatureLogs: (file: File) => Promise<ImportResult>;
  importManualReviews: (file: File) => Promise<ImportResult>;
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
}

export interface RuleFieldRange {
  min: number;
  max: number;
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

export interface RulesPackageApplyResult {
  success: boolean;
  message: string;
  appliedRules?: ReviewRules;
  beforeRules?: ReviewRules;
}
