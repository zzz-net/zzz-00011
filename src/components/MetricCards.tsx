import { Package, ThermometerSun, FileWarning, HelpCircle, Swords, CheckCircle2 } from 'lucide-react';
import { useAppStore, getBatchMetrics } from '@/store';
import type { FC } from 'react';
import type { AnomalyType, ReviewConclusion } from '@/types';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: FC<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  clickable?: boolean;
}

const MetricCard: FC<MetricCardProps> = ({ icon: Icon, label, value, color, onClick, clickable }) => {
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/40 p-4 text-left transition',
        clickable && 'cursor-pointer hover:border-slate-600 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-black/30',
      )}
    >
      <div className={cn('absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl opacity-20 transition group-hover:opacity-30', color)} />
      <div className="relative flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-md border', color.replace('bg-', 'border-').replace('/30', '/40'), color.replace('/30', '/15'))}>
          <Icon className={cn('h-4.5 w-4.5', color.includes('sky') ? 'text-sky-300' : color.includes('orange') ? 'text-orange-300' : color.includes('yellow') ? 'text-yellow-300' : color.includes('rose') ? 'text-rose-300' : color.includes('emerald') ? 'text-emerald-300' : 'text-slate-300')} />
        </div>
      </div>
      <div className="relative mt-3">
        <div className="text-2xl font-semibold tracking-tight text-slate-100" style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
          {value}
        </div>
        <div className="mt-1 text-xs text-slate-400">{label}</div>
      </div>
      {clickable && (
        <div className="relative mt-2 text-[10px] text-slate-500 transition group-hover:text-slate-400">
          点击筛选 →
        </div>
      )}
    </button>
  );
};

const MetricCards: FC = () => {
  const { arrivalBatches, anomalies, reviewDecisions, setFilters, filters } = useAppStore();
  const metrics = getBatchMetrics(arrivalBatches, anomalies, reviewDecisions);

  const toggleFilter = (key: 'anomalyTypes' | 'reviewStatuses', value: AnomalyType | ReviewConclusion) => {
    const current = filters[key] as string[];
    if (current.includes(value as never)) {
      setFilters({ [key]: current.filter((v) => v !== value) } as Partial<typeof filters>);
    } else {
      setFilters({ [key]: [...current, value] } as Partial<typeof filters>);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-slate-200">汇总指标</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          icon={Package}
          label="总批次数"
          value={metrics.totalBatches}
          color="bg-sky-500/30"
          clickable={false}
        />
        <MetricCard
          icon={ThermometerSun}
          label="超温批次"
          value={metrics.overtempCount}
          color="bg-orange-500/30"
          clickable={metrics.overtempCount > 0}
          onClick={() => toggleFilter('anomalyTypes', 'overtemp')}
        />
        <MetricCard
          icon={FileWarning}
          label="缺日志批次"
          value={metrics.missingLogCount}
          color="bg-yellow-500/30"
          clickable={metrics.missingLogCount > 0}
          onClick={() => toggleFilter('anomalyTypes', 'missing_log')}
        />
        <MetricCard
          icon={HelpCircle}
          label="未登记批次"
          value={metrics.unregisteredCount}
          color="bg-cyan-500/30"
          clickable={metrics.unregisteredCount > 0}
          onClick={() => toggleFilter('anomalyTypes', 'unregistered')}
        />
        <MetricCard
          icon={Swords}
          label="复核冲突"
          value={metrics.conflictCount}
          color="bg-rose-500/30"
          clickable={metrics.conflictCount > 0}
          onClick={() => toggleFilter('anomalyTypes', 'review_conflict')}
        />
        <MetricCard
          icon={CheckCircle2}
          label="已复核"
          value={metrics.reviewedCount}
          color="bg-emerald-500/30"
          clickable={metrics.reviewedCount > 0}
          onClick={() => toggleFilter('reviewStatuses', 'release')}
        />
      </div>
    </div>
  );
};

export default MetricCards;
