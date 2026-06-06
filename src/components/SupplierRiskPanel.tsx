import { useMemo, useState } from 'react';
import {
  Building2,
  Search,
  X,
  RotateCcw,
  FileJson,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertOctagon,
  TrendingDown,
  TrendingUp,
  Minus,
  BarChart3,
  Settings,
  Users,
  FileWarning,
  ThermometerSun,
  HelpCircle,
  Swords,
  ClipboardList,
  Flag,
} from 'lucide-react';
import { useAppStore } from '@/store';
import {
  ANOMALY_TYPE_LABEL,
  ANOMALY_TYPE_COLOR,
  CONCLUSION_LABEL,
  CONCLUSION_COLOR,
} from '@/services/anomalyEngine';
import {
  SUPPLIER_RISK_COLOR,
  getSupplierRiskLabel,
  MISSING_SUPPLIER_DISPLAY_NAME,
  detectSupplierNameConflicts,
} from '@/services/supplierRiskService';
import type { FC } from 'react';
import type {
  AnomalyType,
  ReviewConclusion,
  SupplierRiskLevel,
  SupplierRiskProfile,
} from '@/types';

import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import SupplierRiskRulesModal from './SupplierRiskRulesModal';
import SupplierNameConflictModal from './SupplierNameConflictModal';

const ANOMALY_TYPES: AnomalyType[] = ['overtemp', 'missing_log', 'unregistered', 'review_conflict'];
const REVIEW_STATUSES: ReviewConclusion[] = ['unreviewed', 'release', 'quarantine', 'ignore'];
const RISK_LEVELS: SupplierRiskLevel[] = ['critical', 'high', 'medium', 'low', 'safe'];

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm');
  } catch {
    return iso;
  }
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MM-dd');
  } catch {
    return iso;
  }
}

const TrendIcon: FC<{ direction: SupplierRiskProfile['trendDirection'] }> = ({ direction }) => {
  if (direction === 'worsening') return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (direction === 'improving') return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  if (direction === 'stable') return <Minus className="h-3 w-3 text-slate-400" />;
  return <span className="text-[10px] text-slate-500">N/A</span>;
};

const SupplierRiskPanel: FC = () => {
  const {
    computeSupplierRiskProfiles,
    supplierRiskFilter,
    setSupplierRiskFilter,
    exportSupplierRiskData,
    arrivalBatches,
    supplierNameResolution,
  } = useAppStore();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  const profiles = useMemo(() => computeSupplierRiskProfiles(), [computeSupplierRiskProfiles]);

  const conflicts = useMemo(
    () => detectSupplierNameConflicts(arrivalBatches, supplierNameResolution).conflicts.filter((c) => !c.resolved),
    [arrivalBatches, supplierNameResolution],
  );

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const toggleAnomalyType = (t: AnomalyType) => {
    const list = supplierRiskFilter.anomalyTypes.includes(t)
      ? supplierRiskFilter.anomalyTypes.filter((x) => x !== t)
      : [...supplierRiskFilter.anomalyTypes, t];
    setSupplierRiskFilter({ anomalyTypes: list });
  };

  const toggleReviewStatus = (s: ReviewConclusion) => {
    const list = supplierRiskFilter.reviewStatuses.includes(s)
      ? supplierRiskFilter.reviewStatuses.filter((x) => x !== s)
      : [...supplierRiskFilter.reviewStatuses, s];
    setSupplierRiskFilter({ reviewStatuses: list });
  };

  const toggleRiskLevel = (l: SupplierRiskLevel) => {
    const list = supplierRiskFilter.riskLevels.includes(l)
      ? supplierRiskFilter.riskLevels.filter((x) => x !== l)
      : [...supplierRiskFilter.riskLevels, l];
    setSupplierRiskFilter({ riskLevels: list });
  };

  const resetFilter = () => {
    setSupplierRiskFilter({
      timeRangeStart: '',
      timeRangeEnd: '',
      anomalyTypes: [],
      reviewStatuses: [],
      riskLevels: [],
      keyword: '',
      onlyWithPendingHandovers: false,
      onlyWithNameConflicts: false,
    });
  };

  const hasActiveFilter =
    supplierRiskFilter.keyword ||
    supplierRiskFilter.anomalyTypes.length > 0 ||
    supplierRiskFilter.reviewStatuses.length > 0 ||
    supplierRiskFilter.riskLevels.length > 0 ||
    supplierRiskFilter.timeRangeStart ||
    supplierRiskFilter.timeRangeEnd ||
    supplierRiskFilter.onlyWithPendingHandovers ||
    supplierRiskFilter.onlyWithNameConflicts;

  const metrics = useMemo(() => {
    const levelCounts: Record<SupplierRiskLevel, number> = {
      safe: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    let totalBatches = 0;
    let totalAnomalies = 0;
    let totalPending = 0;
    for (const p of profiles) {
      levelCounts[p.riskLevel] += 1;
      totalBatches += p.batchCount;
      totalAnomalies += p.totalAnomalies;
      totalPending += p.pendingHandoverCount;
    }
    return { levelCounts, totalBatches, totalAnomalies, totalPending, conflictCount: conflicts.length };
  }, [profiles, conflicts.length]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 rounded-md bg-violet-500/30 blur-md" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
              <Building2 className="h-4 w-4 text-violet-300" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">供应商温控风险画像</h2>
            <p className="text-[11px] text-slate-500">
              共 {profiles.length} 个供应商 · {metrics.totalBatches} 个批次 · {metrics.totalAnomalies} 个异常
              {metrics.conflictCount > 0 && (
                <> · <span className="text-amber-300">{metrics.conflictCount} 个名称冲突待确认</span></>
              )}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {conflicts.length > 0 && (
            <button
              onClick={() => setConflictModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300 transition hover:bg-amber-500/20"
            >
              <Flag className="h-3.5 w-3.5" />
              <span>名称冲突 ({conflicts.length})</span>
            </button>
          )}
          <button
            onClick={() => setRulesModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>风险等级规则</span>
          </button>
          <button
            onClick={() => exportSupplierRiskData('csv')}
            disabled={profiles.length === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            导出 CSV
          </button>
          <button
            onClick={() => exportSupplierRiskData('json')}
            disabled={profiles.length === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileJson className="h-3.5 w-3.5" />
            导出 JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {RISK_LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => toggleRiskLevel(l)}
            className={cn(
              'flex items-center justify-between rounded-md border px-3 py-2 text-[11px] transition',
              supplierRiskFilter.riskLevels.includes(l)
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-slate-700/60 bg-slate-900/30 hover:border-slate-600',
            )}
          >
            <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px]', SUPPLIER_RISK_COLOR[l])}>
              {getSupplierRiskLabel(l)}
            </span>
            <span className="text-lg font-semibold text-slate-100" style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
              {metrics.levelCounts[l]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={supplierRiskFilter.keyword}
            onChange={(e) => setSupplierRiskFilter({ keyword: e.target.value })}
            placeholder="按供应商名/批次号搜索..."
            className="h-8 w-56 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-7 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
          {supplierRiskFilter.keyword && (
            <button
              onClick={() => setSupplierRiskFilter({ keyword: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div>
          <span className="text-[10px] text-slate-500">开始日期</span>
          <input
            type="date"
            value={supplierRiskFilter.timeRangeStart}
            onChange={(e) => setSupplierRiskFilter({ timeRangeStart: e.target.value })}
            className="ml-1 h-7 rounded-md border border-slate-600 bg-slate-900/50 px-2 text-[11px] text-slate-200 focus:border-sky-500/60 focus:outline-none"
          />
        </div>
        <div>
          <span className="text-[10px] text-slate-500">结束日期</span>
          <input
            type="date"
            value={supplierRiskFilter.timeRangeEnd}
            onChange={(e) => setSupplierRiskFilter({ timeRangeEnd: e.target.value })}
            className="ml-1 h-7 rounded-md border border-slate-600 bg-slate-900/50 px-2 text-[11px] text-slate-200 focus:border-sky-500/60 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-slate-400">异常类型：</span>
          <div className="flex flex-wrap gap-1.5">
            {ANOMALY_TYPES.map((t) => {
              const active = supplierRiskFilter.anomalyTypes.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleAnomalyType(t)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10.5px] transition',
                    active
                      ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  {ANOMALY_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-slate-400">复核状态：</span>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_STATUSES.map((s) => {
              const active = supplierRiskFilter.reviewStatuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleReviewStatus(s)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10.5px] transition',
                    active
                      ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  {CONCLUSION_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={supplierRiskFilter.onlyWithPendingHandovers}
              onChange={(e) => setSupplierRiskFilter({ onlyWithPendingHandovers: e.target.checked })}
              className="h-3 w-3 rounded border-slate-600 bg-slate-900 accent-sky-500"
            />
            仅显示待交接
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={supplierRiskFilter.onlyWithNameConflicts}
              onChange={(e) => setSupplierRiskFilter({ onlyWithNameConflicts: e.target.checked })}
              className="h-3 w-3 rounded border-slate-600 bg-slate-900 accent-amber-500"
            />
            仅显示名称冲突
          </label>
          {hasActiveFilter && (
            <button
              onClick={resetFilter}
              className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            >
              <RotateCcw className="h-3 w-3" />
              重置
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-700/60">
        {profiles.length === 0 ? (
          <div className="p-10 text-center text-[11px] text-slate-500">
            暂无供应商数据，加载样例数据或导入 CSV 后显示
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[auto_1.6fr_repeat(7,1fr)_1fr_auto] gap-2 border-b border-slate-700/50 bg-slate-900/40 px-3 py-2 text-[10.5px] font-medium text-slate-400">
              <div />
              <div>供应商</div>
              <div className="flex items-center gap-1"><PackageIcon className="h-3 w-3" />批次</div>
              <div className="flex items-center gap-1"><ThermometerSun className="h-3 w-3" />超温</div>
              <div className="flex items-center gap-1"><FileWarning className="h-3 w-3" />缺日志</div>
              <div className="flex items-center gap-1"><HelpCircle className="h-3 w-3" />未登记</div>
              <div className="flex items-center gap-1"><Swords className="h-3 w-3" />冲突</div>
              <div className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />待交接</div>
              <div className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />趋势</div>
              <div>风险等级</div>
              <div />
            </div>

            <div className="divide-y divide-slate-700/40">
              {profiles.map((p) => {
                const isExpanded = expandedIds.has(p.canonicalName);
                return (
                  <div key={p.canonicalName}>
                    <div
                      onClick={() => toggleExpand(p.canonicalName)}
                      className="group grid cursor-pointer grid-cols-[auto_1.6fr_repeat(7,1fr)_1fr_auto] items-center gap-2 px-3 py-2.5 text-[11px] transition hover:bg-slate-700/20"
                    >
                      <button className="flex h-4 w-4 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-200">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-slate-100">{p.displayName}</span>
                          {p.displayName === MISSING_SUPPLIER_DISPLAY_NAME && (
                            <span className="text-[9px] text-slate-500">共 {p.missingSupplierBatches.length} 个批次缺供应商名</span>
                          )}
                          {p.hasUnresolvedNameConflict && (
                            <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-300">
                              <Flag className="h-2.5 w-2.5" />
                              名称冲突
                            </span>
                          )}
                        </div>
                        {p.nameVariants.length > 1 && (
                          <div className="mt-0.5 truncate text-[10px] text-slate-500">
                            别名：{p.nameVariants.join(' / ')}
                          </div>
                        )}
                      </div>

                      <div className="font-mono text-slate-200">{p.batchCount}</div>
                      <div className={cn('font-mono', p.overtempCount > 0 ? 'text-orange-300' : 'text-slate-500')}>{p.overtempCount}</div>
                      <div className={cn('font-mono', p.missingLogCount > 0 ? 'text-yellow-300' : 'text-slate-500')}>{p.missingLogCount}</div>
                      <div className={cn('font-mono', p.unregisteredCount > 0 ? 'text-sky-300' : 'text-slate-500')}>{p.unregisteredCount}</div>
                      <div className={cn('font-mono', p.reviewConflictCount > 0 ? 'text-rose-300' : 'text-slate-500')}>{p.reviewConflictCount}</div>
                      <div className={cn('font-mono', p.pendingHandoverCount > 0 ? 'text-amber-300' : 'text-slate-500')}>{p.pendingHandoverCount}</div>

                      <div className="flex items-center gap-1">
                        <TrendIcon direction={p.trendDirection} />
                        <span className="text-[10px] text-slate-500">
                          {p.trendDirection === 'insufficient' ? '—' : p.trendDirection === 'worsening' ? '恶化' : p.trendDirection === 'improving' ? '改善' : '稳定'}
                        </span>
                      </div>

                      <div>
                        <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px]', SUPPLIER_RISK_COLOR[p.riskLevel])}>
                          {getSupplierRiskLabel(p.riskLevel)}
                        </span>
                      </div>

                      <div className="text-right text-[10px] text-slate-500">
                        {p.totalAnomalies > 0 ? `${p.totalAnomalies}异常` : '正常'}
                        {p.lastAnomalyAt && (
                          <div className="mt-0.5 text-[9px] text-slate-600">最近：{fmtDate(p.lastAnomalyAt)}</div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-700/30 bg-slate-900/40 px-8 py-3">
                        {p.trend.length >= 2 && (
                          <div className="mb-3 rounded-md border border-slate-700/50 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <BarChart3 className="h-3 w-3 text-slate-400" />
                              <span className="text-[11px] text-slate-300">
                                近 {p.trend.length} 天异常趋势
                              </span>
                            </div>
                            <div className="flex h-16 items-end gap-1">
                              {p.trend.map((point) => {
                                const max = Math.max(...p.trend.map((t) => t.anomalyCount), 1);
                                const height = max > 0 ? (point.anomalyCount / max) * 100 : 0;
                                return (
                                  <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                                    <div
                                      className={cn(
                                        'w-full rounded-t transition-all',
                                        point.dangerCount > 0 ? 'bg-rose-500/70' : 'bg-sky-500/50',
                                      )}
                                      style={{ height: `${Math.max(height, point.anomalyCount > 0 ? 8 : 2)}%` }}
                                      title={`${point.date}: ${point.anomalyCount} 异常 (${point.dangerCount} 严重)`}
                                    />
                                    <span className="text-[9px] text-slate-500">{fmtDate(point.date)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="rounded-md border border-slate-700/50">
                          <div className="border-b border-slate-700/50 bg-slate-800/40 px-3 py-1.5 text-[10.5px] text-slate-400">
                            关联批次 ({p.batches.length})
                          </div>
                          <table className="w-full text-left text-[10.5px]">
                            <thead className="bg-slate-900/40 text-[10px] text-slate-500">
                              <tr>
                                <th className="px-3 py-1.5 font-medium">批次号</th>
                                <th className="px-3 py-1.5 font-medium">产品</th>
                                <th className="px-3 py-1.5 font-medium">到货时间</th>
                                <th className="px-3 py-1.5 font-medium">异常类型</th>
                                <th className="px-3 py-1.5 font-medium">严重/警告</th>
                                <th className="px-3 py-1.5 font-medium">复核状态</th>
                                <th className="px-3 py-1.5 font-medium">原始行号</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                              {p.batches.map((b) => {
                                const hasDanger = b.anomalyTypes.includes('review_conflict');
                                return (
                                  <tr key={b.batchId}>
                                    <td className="px-3 py-1.5 font-mono text-sky-300">{b.batchId}</td>
                                    <td className="px-3 py-1.5 text-slate-300">{b.productName || '（未登记）'}</td>
                                    <td className="px-3 py-1.5 text-slate-400">{b.arrivalTime ? fmtDateTime(b.arrivalTime) : '—'}</td>
                                    <td className="px-3 py-1.5">
                                      {b.anomalyTypes.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {b.anomalyTypes.map((t) => (
                                            <span key={t} className={cn('inline-flex rounded border px-1 py-0.5 text-[9.5px]', ANOMALY_TYPE_COLOR[t])}>
                                              {ANOMALY_TYPE_LABEL[t]}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-500">无异常</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      {hasDanger ? (
                                        <span className="inline-flex items-center gap-0.5 text-red-400">
                                          <AlertOctagon className="h-2.5 w-2.5" />
                                          含严重
                                        </span>
                                      ) : b.anomalyTypes.length > 0 ? (
                                        <span className="inline-flex items-center gap-0.5 text-amber-400">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          警告
                                        </span>
                                      ) : (
                                        <span className="text-slate-500">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', CONCLUSION_COLOR[b.reviewConclusion ?? 'unreviewed'])}>
                                        {CONCLUSION_LABEL[b.reviewConclusion ?? 'unreviewed']}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-slate-500">
                                      {b.sourceRows.length > 0 ? b.sourceRows.join(', ') : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SupplierRiskRulesModal open={rulesModalOpen} onClose={() => setRulesModalOpen(false)} />
      <SupplierNameConflictModal open={conflictModalOpen} onClose={() => setConflictModalOpen(false)} />
    </div>
  );
};

function PackageIcon({ className }: { className?: string }) {
  return <Users className={className} />;
}

export default SupplierRiskPanel;
