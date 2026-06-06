import { formatISO, parseISO, startOfDay } from 'date-fns';
import type {
  Anomaly,
  AnomalyType,
  ArrivalBatch,
  HandoverRecord,
  ManualReviewRecord,
  ReviewDecision,
  SupplierNameConflict,
  SupplierNameResolutionMap,
  SupplierRiskBatchDetail,
  SupplierRiskFilterState,
  SupplierRiskLevel,
  SupplierRiskProfile,
  SupplierRiskRules,
  SupplierRiskTrendPoint,
  TemperatureLog,
} from '@/types';
import {
  DEFAULT_SUPPLIER_RISK_RULES,
  SUPPLIER_NAME_RESOLUTION_STORAGE_KEY,
  SUPPLIER_RISK_LEVEL_LABELS,
  SUPPLIER_RISK_STORAGE_KEY,
} from '@/types';

const MISSING_SUPPLIER_KEY = '__MISSING_SUPPLIER__';
const MISSING_SUPPLIER_DISPLAY = '（供应商未填写）';

export function normalizeSupplierName(name: string | undefined | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCanonicalSupplierName(
  rawName: string | undefined,
  resolution: SupplierNameResolutionMap,
): string {
  if (!rawName) return MISSING_SUPPLIER_KEY;
  const normalized = normalizeSupplierName(rawName);
  if (!normalized) return MISSING_SUPPLIER_KEY;
  return resolution.variantToCanonical[normalized] ?? normalized;
}

export function loadSupplierRiskRules(): SupplierRiskRules {
  try {
    const raw = localStorage.getItem(SUPPLIER_RISK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SUPPLIER_RISK_RULES };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.levels)) {
      return { ...DEFAULT_SUPPLIER_RISK_RULES };
    }
    return {
      version: parsed.version ?? 1,
      trendWindowDays: parsed.trendWindowDays ?? DEFAULT_SUPPLIER_RISK_RULES.trendWindowDays,
      levels: parsed.levels,
    };
  } catch {
    return { ...DEFAULT_SUPPLIER_RISK_RULES };
  }
}

export function saveSupplierRiskRules(rules: SupplierRiskRules): void {
  try {
    localStorage.setItem(SUPPLIER_RISK_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export function loadSupplierNameResolution(): SupplierNameResolutionMap {
  try {
    const raw = localStorage.getItem(SUPPLIER_NAME_RESOLUTION_STORAGE_KEY);
    if (!raw) return { variantToCanonical: {}, conflicts: [] };
    const parsed = JSON.parse(raw);
    return {
      variantToCanonical: parsed.variantToCanonical ?? {},
      conflicts: parsed.conflicts ?? [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { variantToCanonical: {}, conflicts: [] };
  }
}

export function saveSupplierNameResolution(resolution: SupplierNameResolutionMap): void {
  try {
    const toSave = { ...resolution, updatedAt: new Date().toISOString() };
    localStorage.setItem(SUPPLIER_NAME_RESOLUTION_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

export interface NameConflictDetectionResult {
  conflicts: SupplierNameConflict[];
  batchesByNormalized: Record<string, Record<string, string[]>>;
}

export function detectSupplierNameConflicts(
  batches: ArrivalBatch[],
  existingResolution: SupplierNameResolutionMap,
): NameConflictDetectionResult {
  const batchesByNormalized: Record<string, Record<string, string[]>> = {};

  for (const b of batches) {
    if (!b.supplier) continue;
    const normalized = normalizeSupplierName(b.supplier);
    if (!normalized) continue;
    if (!batchesByNormalized[normalized]) {
      batchesByNormalized[normalized] = {};
    }
    if (!batchesByNormalized[normalized][b.supplier]) {
      batchesByNormalized[normalized][b.supplier] = [];
    }
    batchesByNormalized[normalized][b.supplier].push(b.batchId);
  }

  const conflicts: SupplierNameConflict[] = [];
  const existingResolved = new Set(
    existingResolution.conflicts.filter((c) => c.resolved).map((c) => c.normalizedKey),
  );

  for (const [normalized, variantsMap] of Object.entries(batchesByNormalized)) {
    const variants = Object.keys(variantsMap);
    if (variants.length > 1 && !existingResolved.has(normalized)) {
      const existingConflict = existingResolution.conflicts.find(
        (c) => c.normalizedKey === normalized && !c.resolved,
      );
      if (existingConflict) {
        conflicts.push({
          ...existingConflict,
          variants,
          batchIdsByVariant: variantsMap,
        });
      } else {
        conflicts.push({
          id: `sn-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          normalizedKey: normalized,
          variants,
          batchIdsByVariant: variantsMap,
          resolved: false,
        });
      }
    }
  }

  const unresolvedFromExisting = existingResolution.conflicts.filter(
    (c) => !c.resolved && !batchesByNormalized[c.normalizedKey],
  );

  return { conflicts: [...conflicts, ...unresolvedFromExisting], batchesByNormalized };
}

export function evaluateRiskLevel(
  stats: {
    totalAnomalies: number;
    dangerAnomalies: number;
    overtempCount: number;
    missingLogCount: number;
    unregisteredCount: number;
    reviewConflictCount: number;
    pendingHandoverCount: number;
    trendIncrease?: number;
  },
  rules: SupplierRiskRules,
): { level: SupplierRiskLevel; score: number } {
  const sortedLevels = [...rules.levels].sort((a, b) => {
    const order: SupplierRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b.level) - order.indexOf(a.level);
  });

  for (const rule of sortedLevels) {
    const c = rule.conditions;
    const conditions: boolean[] = [];
    if (c.minDangerAnomalies !== undefined) {
      conditions.push(stats.dangerAnomalies >= c.minDangerAnomalies);
    }
    if (c.minTotalAnomalies !== undefined) {
      conditions.push(stats.totalAnomalies >= c.minTotalAnomalies);
    }
    if (c.minOvertempCount !== undefined) {
      conditions.push(stats.overtempCount >= c.minOvertempCount);
    }
    if (c.minMissingLogCount !== undefined) {
      conditions.push(stats.missingLogCount >= c.minMissingLogCount);
    }
    if (c.minUnregisteredCount !== undefined) {
      conditions.push(stats.unregisteredCount >= c.minUnregisteredCount);
    }
    if (c.minReviewConflictCount !== undefined) {
      conditions.push(stats.reviewConflictCount >= c.minReviewConflictCount);
    }
    if (c.minPendingHandovers !== undefined) {
      conditions.push(stats.pendingHandoverCount >= c.minPendingHandovers);
    }
    if (c.minTrendIncrease !== undefined && stats.trendIncrease !== undefined) {
      conditions.push(stats.trendIncrease >= c.minTrendIncrease);
    }
    if (conditions.length === 0) continue;
    if (conditions.every(Boolean)) {
      const scoreWeights: Record<SupplierRiskLevel, number> = {
        safe: 0,
        low: 25,
        medium: 50,
        high: 75,
        critical: 100,
      };
      return {
        level: rule.level,
        score: scoreWeights[rule.level] + Math.min(stats.dangerAnomalies * 5, 15),
      };
    }
  }

  return { level: 'safe', score: 0 };
}

export function computeTrend(
  anomalies: Anomaly[],
  batches: ArrivalBatch[],
  windowDays: number,
): { trend: SupplierRiskTrendPoint[]; direction: SupplierRiskProfile['trendDirection']; lastAnomalyAt?: string } {
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));
  const byDate = new Map<string, { anomalyCount: number; dangerCount: number }>();
  let lastAnomalyAt: string | undefined;

  for (const a of anomalies) {
    const batch = batchMap.get(a.batchId);
    const dateStr = batch
      ? formatISO(startOfDay(parseISO(batch.arrivalTime)), { representation: 'date' })
      : null;
    if (!dateStr) continue;

    if (!lastAnomalyAt || (batch && batch.arrivalTime > lastAnomalyAt)) {
      lastAnomalyAt = batch?.arrivalTime;
    }

    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, { anomalyCount: 0, dangerCount: 0 });
    }
    const entry = byDate.get(dateStr)!;
    entry.anomalyCount += 1;
    if (a.severity === 'danger') entry.dangerCount += 1;
  }

  const today = startOfDay(new Date());
  const trend: SupplierRiskTrendPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatISO(d, { representation: 'date' });
    const entry = byDate.get(dateStr);
    trend.push({
      date: dateStr,
      anomalyCount: entry?.anomalyCount ?? 0,
      dangerCount: entry?.dangerCount ?? 0,
    });
  }

  let direction: SupplierRiskProfile['trendDirection'] = 'insufficient';
  if (trend.length >= 4) {
    const half = Math.floor(trend.length / 2);
    const firstHalf = trend.slice(0, half);
    const secondHalf = trend.slice(half);
    const firstAvg = firstHalf.reduce((s, p) => s + p.anomalyCount, 0) / half;
    const secondAvg = secondHalf.reduce((s, p) => s + p.anomalyCount, 0) / (trend.length - half);
    const diff = secondAvg - firstAvg;
    if (Math.abs(diff) < 0.3) direction = 'stable';
    else if (diff > 0) direction = 'worsening';
    else direction = 'improving';
  }

  return { trend, direction, lastAnomalyAt };
}

export interface BuildSupplierProfilesInput {
  batches: ArrivalBatch[];
  anomalies: Anomaly[];
  logs: TemperatureLog[];
  reviews: ManualReviewRecord[];
  decisions: Record<string, ReviewDecision>;
  handoverRecords: HandoverRecord[];
  nameResolution: SupplierNameResolutionMap;
  riskRules: SupplierRiskRules;
}

export function buildSupplierRiskProfiles(input: BuildSupplierProfilesInput): SupplierRiskProfile[] {
  const { batches, anomalies, decisions, handoverRecords, nameResolution, riskRules } = input;

  const profileMap = new Map<string, SupplierRiskProfile>();
  const anomalyByBatch = new Map<string, Anomaly[]>();
  for (const a of anomalies) {
    if (!anomalyByBatch.has(a.batchId)) anomalyByBatch.set(a.batchId, []);
    anomalyByBatch.get(a.batchId)!.push(a);
  }

  const pendingHandoverBatches = new Set<string>();
  for (const h of handoverRecords) {
    if (h.status === 'pending' || h.status === 'accepted' || h.status === 'returned') {
      for (const item of h.items) {
        pendingHandoverBatches.add(item.batchId);
      }
    }
  }

  const conflictDetection = detectSupplierNameConflicts(batches, nameResolution);
  const unresolvedConflictKeys = new Set(
    conflictDetection.conflicts.filter((c) => !c.resolved).map((c) => c.normalizedKey),
  );

  const processBatch = (batch: ArrivalBatch | null, batchId: string, supplierRaw?: string) => {
    const canonical = getCanonicalSupplierName(supplierRaw, nameResolution);
    const displayName = canonical === MISSING_SUPPLIER_KEY ? MISSING_SUPPLIER_DISPLAY : supplierRaw ?? MISSING_SUPPLIER_DISPLAY;
    const normalized = supplierRaw ? normalizeSupplierName(supplierRaw) : '';

    if (!profileMap.has(canonical)) {
      profileMap.set(canonical, {
        supplierName: supplierRaw ?? '',
        canonicalName: canonical,
        displayName,
        batchCount: 0,
        overtempCount: 0,
        missingLogCount: 0,
        unregisteredCount: 0,
        reviewConflictCount: 0,
        totalAnomalies: 0,
        dangerAnomalies: 0,
        warningAnomalies: 0,
        pendingHandoverCount: 0,
        riskLevel: 'safe',
        riskScore: 0,
        trend: [],
        trendDirection: 'insufficient',
        batches: [],
        nameVariants: [],
        hasUnresolvedNameConflict: false,
        missingSupplierBatches: [],
      });
    }

    const profile = profileMap.get(canonical)!;
    if (supplierRaw && !profile.nameVariants.includes(supplierRaw)) {
      profile.nameVariants.push(supplierRaw);
    }
    if (normalized && unresolvedConflictKeys.has(normalized)) {
      profile.hasUnresolvedNameConflict = true;
    }
    if (canonical === MISSING_SUPPLIER_KEY) {
      profile.missingSupplierBatches.push(batchId);
    }

    profile.batchCount += 1;

    const batchAnomalies = anomalyByBatch.get(batchId) ?? [];
    const anomalyTypes = new Set<AnomalyType>();
    const anomalyIds: string[] = [];
    const sourceRows: number[] = [];

    for (const a of batchAnomalies) {
      profile.totalAnomalies += 1;
      anomalyTypes.add(a.type);
      anomalyIds.push(a.id);
      sourceRows.push(...a.sourceRows);
      if (a.severity === 'danger') profile.dangerAnomalies += 1;
      else profile.warningAnomalies += 1;
      if (a.type === 'overtemp') profile.overtempCount += 1;
      if (a.type === 'missing_log') profile.missingLogCount += 1;
      if (a.type === 'unregistered') profile.unregisteredCount += 1;
      if (a.type === 'review_conflict') profile.reviewConflictCount += 1;
    }

    if (pendingHandoverBatches.has(batchId)) {
      profile.pendingHandoverCount += 1;
    }

    const detail: SupplierRiskBatchDetail = {
      batchId,
      productName: batch?.productName,
      arrivalTime: batch?.arrivalTime,
      anomalyIds,
      anomalyTypes: Array.from(anomalyTypes),
      sourceRows: Array.from(new Set(sourceRows)),
      reviewConclusion: decisions[batchId]?.conclusion,
    };
    profile.batches.push(detail);
  };

  for (const b of batches) {
    processBatch(b, b.batchId, b.supplier);
  }

  const registeredBatchIds = new Set(batches.map((b) => b.batchId));
  for (const a of anomalies) {
    if (!registeredBatchIds.has(a.batchId)) {
      processBatch(null, a.batchId, undefined);
    }
  }

  const profiles: SupplierRiskProfile[] = [];
  for (const profile of profileMap.values()) {
    const { trend, direction, lastAnomalyAt } = computeTrend(
      anomalies.filter((a) => {
        return profile.batches.some((b) => b.batchId === a.batchId);
      }),
      batches.filter((b) => profile.batches.some((pb) => pb.batchId === b.batchId)),
      riskRules.trendWindowDays,
    );

    const trendHalf = Math.floor(trend.length / 2);
    let trendIncrease = 0;
    if (trend.length >= 4) {
      const first = trend.slice(0, trendHalf).reduce((s, p) => s + p.anomalyCount, 0);
      const second = trend.slice(trendHalf).reduce((s, p) => s + p.anomalyCount, 0);
      trendIncrease = second - first;
    }

    const { level, score } = evaluateRiskLevel(
      {
        totalAnomalies: profile.totalAnomalies,
        dangerAnomalies: profile.dangerAnomalies,
        overtempCount: profile.overtempCount,
        missingLogCount: profile.missingLogCount,
        unregisteredCount: profile.unregisteredCount,
        reviewConflictCount: profile.reviewConflictCount,
        pendingHandoverCount: profile.pendingHandoverCount,
        trendIncrease,
      },
      riskRules,
    );

    profiles.push({
      ...profile,
      trend,
      trendDirection: direction,
      lastAnomalyAt,
      riskLevel: level,
      riskScore: score,
    });
  }

  profiles.sort((a, b) => {
    const levelOrder: SupplierRiskLevel[] = ['critical', 'high', 'medium', 'low', 'safe'];
    const la = levelOrder.indexOf(a.riskLevel);
    const lb = levelOrder.indexOf(b.riskLevel);
    if (la !== lb) return la - lb;
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.totalAnomalies - a.totalAnomalies;
  });

  return profiles;
}

export function filterSupplierRiskProfiles(
  profiles: SupplierRiskProfile[],
  filters: SupplierRiskFilterState,
  batches: ArrivalBatch[],
  decisions: Record<string, ReviewDecision>,
): SupplierRiskProfile[] {
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));

  return profiles.filter((p) => {
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      if (
        !p.displayName.toLowerCase().includes(kw) &&
        !p.nameVariants.some((v) => v.toLowerCase().includes(kw)) &&
        !p.batches.some((b) => b.batchId.toLowerCase().includes(kw))
      ) {
        return false;
      }
    }

    if (filters.riskLevels.length > 0 && !filters.riskLevels.includes(p.riskLevel)) {
      return false;
    }

    if (filters.onlyWithPendingHandovers && p.pendingHandoverCount === 0) {
      return false;
    }

    if (filters.onlyWithNameConflicts && !p.hasUnresolvedNameConflict) {
      return false;
    }

    if (filters.anomalyTypes.length > 0 || filters.reviewStatuses.length > 0 || filters.timeRangeStart || filters.timeRangeEnd) {
      const filteredBatches = p.batches.filter((bd) => {
        if (filters.anomalyTypes.length > 0) {
          const hasMatch = bd.anomalyTypes.some((t) => filters.anomalyTypes.includes(t));
          if (!hasMatch) return false;
        }
        if (filters.reviewStatuses.length > 0) {
          const status = decisions[bd.batchId]?.conclusion ?? 'unreviewed';
          if (!filters.reviewStatuses.includes(status)) return false;
        }
        if (filters.timeRangeStart || filters.timeRangeEnd) {
          const batch = batchMap.get(bd.batchId);
          if (!batch?.arrivalTime) return false;
          const at = parseISO(batch.arrivalTime).getTime();
          if (filters.timeRangeStart && at < parseISO(filters.timeRangeStart).getTime()) return false;
          if (filters.timeRangeEnd && at > parseISO(filters.timeRangeEnd).getTime() + 86400000 - 1) return false;
        }
        return true;
      });
      if (filteredBatches.length === 0) return false;
    }

    return true;
  });
}

export const SUPPLIER_RISK_COLOR: Record<SupplierRiskLevel, string> = {
  safe: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  low: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  critical: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export function getSupplierRiskLabel(level: SupplierRiskLevel): string {
  return SUPPLIER_RISK_LEVEL_LABELS[level] ?? level;
}

export const MISSING_SUPPLIER_DISPLAY_NAME = MISSING_SUPPLIER_DISPLAY;
export { MISSING_SUPPLIER_KEY };
