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
  TemperatureLog,
} from '@/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectOvertemp(
  batch: ArrivalBatch,
  logs: TemperatureLog[],
): Anomaly | null {
  const validLogs = logs
    .filter((l) => l.isValid && l.batchId === batch.batchId)
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

  if (validLogs.length === 0) return null;

  const intervals: OvertimeInterval[] = [];
  const sourceRows: number[] = [];
  let currentInterval: OvertimeInterval | null = null;
  let hasOvertemp = false;

  for (const log of validLogs) {
    const isOver = log.temperature > batch.requiredTempMax || log.temperature < batch.requiredTempMin;
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
    (a, b) => (Math.abs(b.maxTemp - batch.requiredTempMax) > Math.abs(a.maxTemp - batch.requiredTempMax) ? b : a),
    intervals[0],
  );

  return {
    id: genId('anom-over'),
    batchId: batch.batchId,
    type: 'overtemp',
    severity: totalDuration > 30 || Math.abs(worst.maxTemp - batch.requiredTempMax) > 5 ? 'danger' : 'warning',
    description: `检测到 ${intervals.length} 段超温区间，累计 ${totalDuration} 分钟，峰值温度 ${worst.maxTemp.toFixed(1)}°C（要求 ${batch.requiredTempMin}~${batch.requiredTempMax}°C）`,
    detail: { overtimeIntervals: intervals },
    sourceRows: Array.from(new Set(sourceRows)),
  };
}

function detectMissingLog(
  batch: ArrivalBatch,
  logs: TemperatureLog[],
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
        missingSegments: [{
          expectedStartTime: batch.arrivalTime,
          expectedEndTime: batch.arrivalTime,
          gapMin: 0,
        }],
      },
      sourceRows: [],
    };
  }

  const arrivalTime = parseISO(batch.arrivalTime);
  const firstLog = parseISO(validLogs[0].timestamp);
  const lastLog = parseISO(validLogs[validLogs.length - 1].timestamp);

  if (differenceInMinutes(firstLog, arrivalTime) > 30) {
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
    if (gap > 30) {
      segments.push({
        expectedStartTime: validLogs[i - 1].timestamp,
        expectedEndTime: validLogs[i].timestamp,
        gapMin: gap,
      });
      sourceRows.push(validLogs[i - 1].sourceRow, validLogs[i].sourceRow);
    }
  }

  if (differenceInMinutes(arrivalTime, lastLog) > 30) {
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
    severity: maxGap.gapMin > 120 ? 'danger' : 'warning',
    description: `检测到 ${segments.length} 段日志缺失，最长间隔 ${maxGap.gapMin} 分钟`,
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
    const conclusions = new Set(records.map((r) => r.conclusion).filter((c) => c !== 'unreviewed'));
    const conflicts: ReviewConflictItem[] = [];

    if (conclusions.size > 1) {
      const sorted = [...records].sort((a, b) => parseISO(a.reviewTime).getTime() - parseISO(b.reviewTime).getTime());
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
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const batch of batches) {
    const overtemp = detectOvertemp(batch, logs);
    if (overtemp) anomalies.push(overtemp);
    const missing = detectMissingLog(batch, logs);
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
