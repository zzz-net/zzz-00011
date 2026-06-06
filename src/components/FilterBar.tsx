import { Search, X, RotateCcw, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useAppStore, applyFilters } from '@/store';
import { ANOMALY_TYPE_LABEL, CONCLUSION_LABEL } from '@/services/anomalyEngine';
import type { FC } from 'react';
import type { AnomalyType, ReviewConclusion } from '@/types';
import { cn } from '@/lib/utils';

const ANOMALY_TYPES: AnomalyType[] = ['overtemp', 'missing_log', 'unregistered', 'review_conflict'];
const REVIEW_STATUSES: ReviewConclusion[] = ['unreviewed', 'release', 'quarantine', 'ignore'];

const FilterBar: FC = () => {
  const { filters, setFilters, anomalies, reviewDecisions, exportData } = useAppStore();
  const filteredCount = applyFilters(anomalies, reviewDecisions, filters).length;

  const toggleType = (t: AnomalyType) => {
    const list = filters.anomalyTypes.includes(t)
      ? filters.anomalyTypes.filter((x) => x !== t)
      : [...filters.anomalyTypes, t];
    setFilters({ anomalyTypes: list });
  };

  const toggleStatus = (s: ReviewConclusion) => {
    const list = filters.reviewStatuses.includes(s)
      ? filters.reviewStatuses.filter((x) => x !== s)
      : [...filters.reviewStatuses, s];
    setFilters({ reviewStatuses: list });
  };

  const reset = () => {
    setFilters({ batchId: '', anomalyTypes: [], reviewStatuses: [] });
  };

  const hasActiveFilters =
    filters.batchId || filters.anomalyTypes.length > 0 || filters.reviewStatuses.length > 0;

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">筛选与导出</h2>
          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300">
            显示 {filteredCount} / {anomalies.length} 条异常
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => exportData('csv')}
            disabled={filteredCount === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>导出 CSV</span>
          </button>
          <button
            onClick={() => exportData('json')}
            disabled={filteredCount === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span>导出 JSON</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={filters.batchId}
            onChange={(e) => setFilters({ batchId: e.target.value })}
            placeholder="按批次号搜索..."
            className="h-8 w-56 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
          {filters.batchId && (
            <button
              onClick={() => setFilters({ batchId: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-slate-400">异常类型：</span>
          <div className="flex flex-wrap gap-1.5">
            {ANOMALY_TYPES.map((t) => {
              const active = filters.anomalyTypes.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] transition',
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
              const active = filters.reviewStatuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] transition',
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

        {hasActiveFilters && (
          <button
            onClick={reset}
            className="mt-auto flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <RotateCcw className="h-3 w-3" />
            重置筛选
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterBar;
