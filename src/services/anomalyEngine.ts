import { differenceInMinutes, parseISO } from 'date-fns';
import type {
  Anomaly,
  AnomalyType,
  ArrivalBatch,
  ManualReviewRecord,
  MissingLogSegment,
  OvertimeInterval,
  ReviewConflictItem,
  ReviewDecision,
  ReviewRules,
  TemperatureLog,
} from '@/types';
import { DEFAULT_REVIEW_RULES } from '@/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectOvertemp(
  batch: ArrivalBatch,
  logs: TemperatureLog[],
  rules: ReviewRules,
): Anomaly | null {
  const validLogs = logs
    .filter((l) => l.isValid && l.batchId === batch.batchId)
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

  if (validLogs.length === 0) return null;

  const intervals: OvertimeInterval[] = [];
  const sourceRows: number[] = [];
  let currentInterval: OvertimeInterval | null = null;
  let hasOvertemp = false;

  const effectiveMin = batch.requiredTempMin - rules.overtempThreshold;
  const effectiveMax = batch.requiredTempMax + rules.overtempThreshold;

  for (const log of validLogs) {
    const isOver = log.temperature > effectiveMax || log.temperature < effectiveMin;
    if (isOver) {
      hasOvertemp = true;
      sourceRows.push(log.sourceRow);
      if (!currentInterval) {
        currentInterval = {
          startTime: log.timestamp,
          endTime: log.timestamp,
          maxTemp: log.temperature,
          minTemp: log.temperature,
          durationMin: 0,
          logRows: [log.sourceRow],
        };
      } else {
        currentInterval.endTime = log.timestamp;
        currentInterval.maxTemp = Math.max(currentInterval.maxTemp, log.temperature);
        currentInterval.minTemp = Math.min(currentInterval.minTemp, log.temperature);
        currentInterval.logRows.push(log.sourceRow);
        currentInterval.durationMin = Math.max(
          currentInterval.durationMin,
          differenceInMinutes(parseISO(currentInterval.endTime), parseISO(currentInterval.startTime)),
        );
      }
    } else if (currentInterval) {
      currentInterval.durationMin = Math.max(
        currentInterval.durationMin,
        differenceInMinutes(parseISO(currentInterval.endTime), parseISO(currentInterval.startTime)),
      ) || 5;
      intervals.push(currentInterval);
      currentInterval = null;
    }
  }
  if (currentInterval) {
    currentInterval.durationMin = Math.max(
      currentInterval.durationMin,
      differenceInMinutes(parseISO(currentInterval.endTime), parseISO(currentInterval.startTime)),
    ) || 5;
    intervals.push(currentInterval);
  }

  if (!hasOvertemp || intervals.length === 0) return null;

  const totalDuration = intervals.reduce((s, i) => s + i.durationMin, 0);
  const worst = intervals.reduce(
    (a, b) => {
      const deltaA = Math.max(
        Math.abs(a.maxTemp - batch.requiredTempMax),
        Math.abs(a.minTemp - batch.requiredTempMin),
      );
      const deltaB = Math.max(
        Math.abs(b.maxTemp - batch.requiredTempMax),
        Math.abs(b.minTemp - batch.requiredTempMin),
      );
      return deltaB > deltaA ? b : a;
    },
    intervals[0],
  );
  const worstDelta = Math.max(
    Math.abs(worst.maxTemp - batch.requiredTempMax),
    Math.abs(worst.minTemp - batch.requiredTempMin),
  );

  return {
    id: genId('anom-over'),
    batchId: batch.batchId,
    type: 'overtemp',
    severity:
      totalDuration > rules.overtempDurationDangerMin || worstDelta > rules.overtempDeltaDanger
        ? 'danger'
        : 'warning',
    description: `检测到 ${intervals.length} 段超温区间，累计 ${totalDuration} 分钟，峰值温度偏差 ${worstDelta.toFixed(1)}°C（要求 ${batch.requiredTempMin}~${batch.requiredTempMax}°C，阈值±${rules.overtempThreshold}°C）`,
    detail: { overtimeIntervals: intervals },
    sourceRows: Array.from(new Set(sourceRows)),
  };
}

function detectMissingLog(
  batch: ArrivalBatch,
  logs: TemperatureLog[],
  rules: ReviewRules,
): Anomaly | null {
  const validLogs = logs
    .filter((l) => l.isValid && l.batchId === batch.batchId)
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

  const segments: MissingLogSegment[] = [];
  const sourceRows: number[] = [];

  if (validLogs.length === 0) {
    return {
      id: genId('anom-miss'),
      batchId: batch.batchId,
      type: 'missing_log',
      severity: 'danger',
      description: '该批次无有效温度日志记录',
      detail: {
        missingSegments: [
          {
            expectedStartTime: batch.arrivalTime,
            expectedEndTime: batch.arrivalTime,
            gapMin: 0,
          },
        ],
      },
      sourceRows: [],
    };
  }

  const arrivalTime = parseISO(batch.arrivalTime);
  const firstLog = parseISO(validLogs[0].timestamp);
  const lastLog = parseISO(validLogs[validLogs.length - 1].timestamp);

  if (differenceInMinutes(firstLog, arrivalTime) > rules.missingLogIntervalMin) {
    segments.push({
      expectedStartTime: batch.arrivalTime,
      expectedEndTime: validLogs[0].timestamp,
      gapMin: differenceInMinutes(firstLog, arrivalTime),
    });
  }

  for (let i = 1; i < validLogs.length; i++) {
    const prev = parseISO(validLogs[i - 1].timestamp);
    const curr = parseISO(validLogs[i].timestamp);
    const gap = differenceInMinutes(curr, prev);
    if (gap > rules.missingLogIntervalMin) {
      segments.push({
        expectedStartTime: validLogs[i - 1].timestamp,
        expectedEndTime: validLogs[i].timestamp,
        gapMin: gap,
      });
      sourceRows.push(validLogs[i - 1].sourceRow, validLogs[i].sourceRow);
    }
  }

  if (differenceInMinutes(arrivalTime, lastLog) > rules.missingLogIntervalMin) {
    segments.push({
      expectedStartTime: validLogs[validLogs.length - 1].timestamp,
      expectedEndTime: batch.arrivalTime,
      gapMin: differenceInMinutes(arrivalTime, lastLog),
    });
  }

  if (segments.length === 0) return null;

  const maxGap = segments.reduce((a, b) => (b.gapMin > a.gapMin ? b : a), segments[0]);

  return {
    id: genId('anom-miss'),
    batchId: batch.batchId,
    type: 'missing_log',
    severity: maxGap.gapMin > rules.missingLogGapDangerMin ? 'danger' : 'warning',
    description: `检测到 ${segments.length} 段日志缺失，最长间隔 ${maxGap.gapMin} 分钟（判定阈值 ${rules.missingLogIntervalMin} 分钟）`,
    detail: { missingSegments: segments },
    sourceRows: Array.from(new Set(sourceRows)),
  };
}

function detectUnregistered(
  batches: ArrivalBatch[],
  logs: TemperatureLog[],
  reviews: ManualReviewRecord[],
): Anomaly[] {
  const registeredIds = new Set(batches.map((b) => b.batchId));
  const anomalies: Anomaly[] = [];
  const seen = new Set<string>();

  for (const log of logs.filter((l) => l.isValid)) {
    if (!registeredIds.has(log.batchId) && !seen.has(log.batchId)) {
      seen.add(log.batchId);
      anomalies.push({
        id: genId('anom-unreg'),
        batchId: log.batchId,
        type: 'unregistered',
        severity: 'warning',
        description: '温度日志中存在该批次，但到货清单未登记',
        detail: { unregisteredSource: 'log' },
        sourceRows: logs.filter((l) => l.batchId === log.batchId).map((l) => l.sourceRow),
      });
    }
  }

  for (const rev of reviews) {
    if (!registeredIds.has(rev.batchId) && !seen.has(rev.batchId)) {
      seen.add(rev.batchId);
      anomalies.push({
        id: genId('anom-unreg'),
        batchId: rev.batchId,
        type: 'unregistered',
        severity: 'warning',
        description: '人工复核中存在该批次，但到货清单未登记',
        detail: { unregisteredSource: 'review' },
        sourceRows: reviews.filter((r) => r.batchId === rev.batchId).map((r) => r.sourceRow),
      });
    }
  }

  return anomalies;
}

function detectReviewConflict(
  reviews: ManualReviewRecord[],
  decisions: Record<string, ReviewDecision>,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const grouped = new Map<string, ManualReviewRecord[]>();
  for (const r of reviews) {
    if (!grouped.has(r.batchId)) grouped.set(r.batchId, []);
    grouped.get(r.batchId)!.push(r);
  }

  for (const [batchId, records] of grouped.entries()) {
    const conclusions = new Set(
      records.map((r) => r.conclusion).filter((c) => c !== 'unreviewed'),
    );
    const conflicts: ReviewConflictItem[] = [];

    if (conclusions.size > 1) {
      const sorted = [...records].sort(
        (a, b) => parseISO(a.reviewTime).getTime() - parseISO(b.reviewTime).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].conclusion !== sorted[0].conclusion) {
          conflicts.push({
            existingConclusion: sorted[0].conclusion,
            existingReviewer: sorted[0].reviewer,
            existingTime: sorted[0].reviewTime,
            importedConclusion: sorted[i].conclusion,
            importedReviewer: sorted[i].reviewer,
            importedTime: sorted[i].reviewTime,
            sourceRow: sorted[i].sourceRow,
          });
        }
      }
    }

    const existingDecision = decisions[batchId];
    if (existingDecision && existingDecision.conclusion !== 'unreviewed') {
      for (const r of records) {
        if (r.conclusion !== existingDecision.conclusion && r.conclusion !== 'unreviewed') {
          conflicts.push({
            existingConclusion: existingDecision.conclusion,
            existingReviewer: existingDecision.reviewer,
            existingTime: existingDecision.updatedAt,
            importedConclusion: r.conclusion,
            importedReviewer: r.reviewer,
            importedTime: r.reviewTime,
            sourceRow: r.sourceRow,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      anomalies.push({
        id: genId('anom-conf'),
        batchId,
        type: 'review_conflict',
        severity: 'danger',
        description: `检测到 ${conflicts.length} 处复核结论冲突`,
        detail: { conflictItems: conflicts },
        sourceRows: Array.from(new Set(conflicts.map((c) => c.sourceRow))),
      });
    }
  }

  return anomalies;
}

export function detectAllAnomalies(
  batches: ArrivalBatch[],
  logs: TemperatureLog[],
  reviews: ManualReviewRecord[],
  decisions: Record<string, ReviewDecision>,
  rules: ReviewRules = DEFAULT_REVIEW_RULES,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const batch of batches) {
    const overtemp = detectOvertemp(batch, logs, rules);
    if (overtemp) anomalies.push(overtemp);
    const missing = detectMissingLog(batch, logs, rules);
    if (missing) anomalies.push(missing);
  }

  anomalies.push(...detectUnregistered(batches, logs, reviews));
  anomalies.push(...detectReviewConflict(reviews, decisions));

  return anomalies;
}

export const ANOMALY_TYPE_LABEL: Record<AnomalyType, string> = {
  overtemp: '超温',
  missing_log: '缺日志',
  unregistered: '到货未登记',
  review_conflict: '复核冲突',
};

export const ANOMALY_TYPE_COLOR: Record<AnomalyType, string> = {
  overtemp: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  missing_log: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  unregistered: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  review_conflict: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export const CONCLUSION_LABEL: Record<string, string> = {
  release: '放行',
  quarantine: '隔离',
  ignore: '忽略',
  unreviewed: '未复核',
};

export const CONCLUSION_COLOR: Record<string, string> = {
  release: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  quarantine: 'bg-red-500/20 text-red-300 border-red-500/40',
  ignore: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  unreviewed: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  import_arrival: '导入到货清单',
  import_log: '导入温度日志',
  import_review: '导入复核记录',
  import_blocked: '导入被阻断',
  field_mapping_changed: '字段映射变更',
  load_sample: '加载样例数据',
  change_rules: '修改复核规则',
  review_decision: '提交复核决策',
  undo_review: '撤销复核决策',
  clear_all: '清空所有数据',
  export_data: '导出数据',
  export_rules_package: '导出规则配置包',
  import_rules_package: '导入规则配置包',
  create_handover: '创建交接清单',
  accept_handover: '接收交接任务',
  return_handover: '退回交接任务',
  complete_handover: '完成交接复核',
  handover_conflict: '交接处理冲突',
  change_supplier_risk_rules: '修改供应商风险规则',
  supplier_name_merge_confirmed: '供应商名称合并',
  supplier_name_merge_kept_separate: '供应商名称保留独立',
  export_supplier_risk: '导出供应商风险画像',
};

export const HANDOVER_STATUS_LABEL: Record<string, string> = {
  pending: '待接收',
  accepted: '处理中',
  returned: '已退回',
  completed: '已完成',
};

export const HANDOVER_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  accepted: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  returned: 'bg-red-500/20 text-red-300 border-red-500/40',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};
