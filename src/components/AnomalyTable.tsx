import { Fragment, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertOctagon,
  MapPin,
  FileText,
  Pencil,
  User,
  Calendar,
} from 'lucide-react';
import { useAppStore, applyFilters } from '@/store';
import {
  ANOMALY_TYPE_LABEL,
  ANOMALY_TYPE_COLOR,
  CONCLUSION_LABEL,
  CONCLUSION_COLOR,
} from '@/services/anomalyEngine';
import type { FC } from 'react';
import type { Anomaly } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { parseISO } from 'date-fns';

interface AnomalyTableProps {
  onOpenReview: (batchId: string) => void;
}

function fmtTime(iso: string): string {
  try {
    return format(parseISO(iso), 'MM-dd HH:mm');
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return iso;
  }
}

const AnomalyTable: FC<AnomalyTableProps> = ({ onOpenReview }) => {
  const {
    anomalies,
    reviewDecisions,
    arrivalBatches,
    filters,
    setReviewDecision,
  } = useAppStore();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filtered = applyFilters(anomalies, reviewDecisions, filters);
  const batchMap = new Map(arrivalBatches.map((b) => [b.batchId, b]));

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const quickReview = (batchId: string, conclusion: 'release' | 'quarantine' | 'ignore') => {
    setReviewDecision(batchId, conclusion, `快速${CONCLUSION_LABEL[conclusion]}`);
  };

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-slate-600 bg-slate-900/50">
          <FileText className="h-6 w-6 text-slate-500" />
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {anomalies.length === 0 ? '暂无异常数据，请先导入 CSV 或加载样例数据' : '当前筛选条件下无匹配的异常记录'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {anomalies.length > 0 && `系统共检测到 ${anomalies.length} 条异常，尝试调整筛选条件`}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-700/60 bg-slate-900/40 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-8 px-3 py-2.5"></th>
              <th className="px-3 py-2.5 font-medium">批次号 / 产品</th>
              <th className="px-3 py-2.5 font-medium">异常类型</th>
              <th className="px-3 py-2.5 font-medium">级别</th>
              <th className="w-96 px-3 py-2.5 font-medium">异常描述</th>
              <th className="px-3 py-2.5 font-medium">原始行</th>
              <th className="px-3 py-2.5 font-medium">复核状态</th>
              <th className="px-3 py-2.5 font-medium">复核人 / 时间</th>
              <th className="px-3 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {filtered.map((a, idx) => {
              const batch = batchMap.get(a.batchId);
              const decision = reviewDecisions[a.batchId];
              const isExpanded = expanded.has(a.id);
              return (
                <Fragment key={a.id}>
                  <tr
                    className={cn(
                      'transition hover:bg-slate-700/20',
                      idx % 2 === 1 && 'bg-slate-900/20',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggle(a.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[12px] text-sky-300">{a.batchId}</div>
                      <div className="text-[11px] text-slate-400">
                        {batch?.productName ?? '（未登记到货）'}
                      </div>
                      {batch && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          要求 {batch.requiredTempMin}~{batch.requiredTempMax}°C · 到货 {fmtTime(batch.arrivalTime)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]', ANOMALY_TYPE_COLOR[a.type])}>
                        {ANOMALY_TYPE_LABEL[a.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {a.severity === 'danger' ? (
                        <span className="inline-flex items-center gap-1 text-red-400">
                          <AlertOctagon className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-medium">严重</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-medium">警告</span>
                        </span>
                      )}
                    </td>
                    <td className="w-96 px-3 py-2.5">
                      <p className="line-clamp-2 text-[11.5px] leading-snug text-slate-300">{a.description}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        <MapPin className="h-2.5 w-2.5" />
                        {a.sourceRows.length > 0 ? a.sourceRows.slice(0, 3).join(',') : '-'}
                        {a.sourceRows.length > 3 && ` +${a.sourceRows.length - 3}`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]', CONCLUSION_COLOR[decision?.conclusion ?? 'unreviewed'])}>
                        {CONCLUSION_LABEL[decision?.conclusion ?? 'unreviewed']}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {decision ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-[10.5px] text-slate-300">
                            <User className="h-3 w-3 text-slate-500" />
                            {decision.reviewer}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Calendar className="h-3 w-3" />
                            {fmtTime(decision.updatedAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10.5px] text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => quickReview(a.batchId, 'release')}
                          title="快速放行"
                          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[10px] text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          放行
                        </button>
                        <button
                          onClick={() => quickReview(a.batchId, 'quarantine')}
                          title="快速隔离"
                          className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-[10px] text-red-300 transition hover:bg-red-500/20"
                        >
                          隔离
                        </button>
                        <button
                          onClick={() => quickReview(a.batchId, 'ignore')}
                          title="快速忽略"
                          className="rounded border border-slate-500/30 bg-slate-500/10 px-1.5 py-1 text-[10px] text-slate-300 transition hover:bg-slate-500/20"
                        >
                          忽略
                        </button>
                        <button
                          onClick={() => onOpenReview(a.batchId)}
                          title="详细复核（可填写备注）"
                          className="rounded border border-sky-500/30 bg-sky-500/10 p-1 text-sky-300 transition hover:bg-sky-500/20"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-900/60">
                      <td colSpan={9} className="px-4 py-4">
                        <AnomalyDetail anomaly={a} batchProductName={batch?.productName} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AnomalyDetail: FC<{ anomaly: Anomaly; batchProductName?: string }> = ({ anomaly }) => {
  const { temperatureLogs, manualReviews } = useAppStore();
  const logs = temperatureLogs.filter((l) => l.batchId === anomaly.batchId);

  if (anomaly.type === 'overtemp' && anomaly.detail.overtimeIntervals) {
    return (
      <div className="space-y-3">
        <h4 className="text-[12px] font-semibold text-orange-300">超温区间明细</h4>
        <div className="overflow-hidden rounded border border-slate-700/60">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800/60 text-[10px] text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">开始时间</th>
                <th className="px-3 py-2 font-medium">结束时间</th>
                <th className="px-3 py-2 font-medium">持续(分钟)</th>
                <th className="px-3 py-2 font-medium">温度范围</th>
                <th className="px-3 py-2 font-medium">原始日志行号</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {anomaly.detail.overtimeIntervals.map((iv, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtDateTime(iv.startTime)}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtDateTime(iv.endTime)}</td>
                  <td className="px-3 py-2 text-orange-300">{iv.durationMin}</td>
                  <td className="px-3 py-2">
                    <span className="text-red-400">{iv.minTemp.toFixed(1)}°C</span>
                    <span className="mx-1 text-slate-500">~</span>
                    <span className="text-red-400 font-semibold">{iv.maxTemp.toFixed(1)}°C</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{iv.logRows.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TemperatureTimeline batchId={anomaly.batchId} />
      </div>
    );
  }

  if (anomaly.type === 'missing_log' && anomaly.detail.missingSegments) {
    return (
      <div className="space-y-3">
        <h4 className="text-[12px] font-semibold text-yellow-300">日志缺失区间明细</h4>
        <div className="overflow-hidden rounded border border-slate-700/60">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800/60 text-[10px] text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">上一条记录</th>
                <th className="px-3 py-2 font-medium">下一条记录</th>
                <th className="px-3 py-2 font-medium">间隔(分钟)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {anomaly.detail.missingSegments.map((sg, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtDateTime(sg.expectedStartTime)}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtDateTime(sg.expectedEndTime)}</td>
                  <td className="px-3 py-2 text-yellow-300 font-semibold">{sg.gapMin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length > 0 && <TemperatureTimeline batchId={anomaly.batchId} />}
      </div>
    );
  }

  if (anomaly.type === 'review_conflict' && anomaly.detail.conflictItems) {
    const allReviews = manualReviews.filter((r) => r.batchId === anomaly.batchId);
    return (
      <div className="space-y-3">
        <h4 className="text-[12px] font-semibold text-rose-300">复核冲突明细</h4>
        <div className="overflow-hidden rounded border border-slate-700/60">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800/60 text-[10px] text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">来源</th>
                <th className="px-3 py-2 font-medium">复核人</th>
                <th className="px-3 py-2 font-medium">结论</th>
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">原始行</th>
                <th className="px-3 py-2 font-medium">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {allReviews.map((r, i) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-400">导入记录 #{i + 1}</td>
                  <td className="px-3 py-2 text-slate-300">{r.reviewer}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px]', CONCLUSION_COLOR[r.conclusion])}>
                      {CONCLUSION_LABEL[r.conclusion]}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{fmtDateTime(r.reviewTime)}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{r.sourceRow}</td>
                  <td className="px-3 py-2 text-slate-400">{r.remark ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (anomaly.type === 'unregistered') {
    const batchLogs = temperatureLogs.filter((l) => l.batchId === anomaly.batchId && l.isValid);
    const batchReviews = manualReviews.filter((r) => r.batchId === anomaly.batchId);
    return (
      <div className="space-y-3">
        <h4 className="text-[12px] font-semibold text-sky-300">
          来源：{anomaly.detail.unregisteredSource === 'log' ? '温度日志存在但到货未登记' : '人工复核存在但到货未登记'}
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          {batchLogs.length > 0 && (
            <div className="rounded border border-slate-700/60 p-3">
              <h5 className="mb-2 text-[11px] font-medium text-slate-300">关联温度日志 ({batchLogs.length} 条)</h5>
              <div className="max-h-32 space-y-1 overflow-auto">
                {batchLogs.slice(0, 10).map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded bg-slate-900/50 px-2 py-1 text-[10.5px]">
                    <span className="font-mono text-slate-300">{fmtDateTime(l.timestamp)}</span>
                    <span className="text-slate-400">
                      {l.isValid ? `${l.temperature.toFixed(1)}°C` : `无效: ${l.invalidReason}`}
                      <span className="ml-2 font-mono text-slate-500">行 {l.sourceRow}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {batchReviews.length > 0 && (
            <div className="rounded border border-slate-700/60 p-3">
              <h5 className="mb-2 text-[11px] font-medium text-slate-300">关联复核记录 ({batchReviews.length} 条)</h5>
              <div className="max-h-32 space-y-1 overflow-auto">
                {batchReviews.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded bg-slate-900/50 px-2 py-1 text-[10.5px]">
                    <span className="text-slate-300">{r.reviewer}</span>
                    <span className={cn('rounded border px-1 py-0.5 text-[10px]', CONCLUSION_COLOR[r.conclusion])}>
                      {CONCLUSION_LABEL[r.conclusion]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <div className="text-xs text-slate-400">暂无更多详情</div>;
};

const TemperatureTimeline: FC<{ batchId: string }> = ({ batchId }) => {
  const { temperatureLogs, arrivalBatches } = useAppStore();
  const batch = arrivalBatches.find((b) => b.batchId === batchId);
  const logs = temperatureLogs
    .filter((l) => l.batchId === batchId && l.isValid)
    .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

  if (!batch || logs.length === 0) return null;

  const minT = Math.min(...logs.map((l) => l.temperature), batch.requiredTempMin) - 2;
  const maxT = Math.max(...logs.map((l) => l.temperature), batch.requiredTempMax) + 2;
  const range = maxT - minT || 1;

  return (
    <div className="space-y-2">
      <h5 className="text-[11px] font-medium text-slate-300">温度时间线</h5>
      <div className="relative rounded border border-slate-700/60 bg-slate-950/40 p-3">
        <div
          className="absolute left-3 right-3 rounded bg-emerald-500/10"
          style={{
            top: `${((maxT - batch.requiredTempMax) / range) * 100}%`,
            bottom: `${((batch.requiredTempMin - minT) / range) * 100}%`,
          }}
        />
        <div className="relative flex h-40 items-end gap-0.5">
          {logs.map((l) => {
            const h = ((l.temperature - minT) / range) * 100;
            const over = l.temperature > batch.requiredTempMax || l.temperature < batch.requiredTempMin;
            return (
              <div
                key={l.id}
                className="group relative flex-1"
                style={{ height: '100%' }}
                title={`${fmtDateTime(l.timestamp)}: ${l.temperature.toFixed(1)}°C (行 ${l.sourceRow})`}
              >
                <div
                  className={cn(
                    'w-full rounded-sm transition group-hover:opacity-100',
                    over ? 'bg-red-500/80' : 'bg-sky-400/70',
                  )}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${h}%`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
          <span>{logs.length > 0 ? fmtTime(logs[0].timestamp) : ''}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-sky-400/70" /> 正常
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-red-500/80" /> 超温
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/20" /> 合格区间
            </span>
          </div>
          <span>{logs.length > 0 ? fmtTime(logs[logs.length - 1].timestamp) : ''}</span>
        </div>
      </div>
    </div>
  );
};

export default AnomalyTable;
