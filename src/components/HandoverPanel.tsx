import { useState } from 'react';
import {
  ClipboardList,
  Search,
  X,
  RotateCcw,
  FileJson,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  User,
  Clock,
  AlertOctagon,
  Lock,
  Pencil,
} from 'lucide-react';
import {
  useAppStore,
  applyHandoverFilters,
  getHandoverMetrics,
} from '@/store';
import {
  HANDOVER_STATUS_LABEL,
  HANDOVER_STATUS_COLOR,
  ANOMALY_TYPE_LABEL,
  ANOMALY_TYPE_COLOR,
  CONCLUSION_LABEL,
  CONCLUSION_COLOR,
} from '@/services/anomalyEngine';
import type { FC } from 'react';
import type { HandoverRecord, HandoverStatus } from '@/types';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore } from 'date-fns';
import HandoverProcessModal from './HandoverProcessModal';

const ALL_STATUSES: HandoverStatus[] = ['pending', 'accepted', 'returned', 'completed'];

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm');
  } catch {
    return iso;
  }
}

const HandoverPanel: FC = () => {
  const {
    handoverRecords,
    handoverLocks,
    handoverFilter,
    setHandoverFilter,
    currentReviewer,
    exportHandoverData,
    acceptHandover,
  } = useAppStore();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [processModal, setProcessModal] = useState<{ open: boolean; handover: HandoverRecord | null }>({
    open: false,
    handover: null,
  });
  const [view, setView] = useState<'todo' | 'all' | 'created'>('todo');

  const metrics = getHandoverMetrics(handoverRecords, currentReviewer);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const toggleStatus = (s: HandoverStatus) => {
    const list = handoverFilter.statuses.includes(s)
      ? handoverFilter.statuses.filter((x) => x !== s)
      : [...handoverFilter.statuses, s];
    setHandoverFilter({ statuses: list });
  };

  const resetFilter = () => {
    setHandoverFilter({ keyword: '', statuses: [], handedBy: '', receivedBy: '' });
  };

  const filteredAll = applyHandoverFilters(handoverRecords, handoverFilter);
  let filtered = filteredAll;
  if (view === 'todo') {
    filtered = filteredAll.filter(
      (h) => h.receivedBy === currentReviewer && (h.status === 'pending' || h.status === 'returned' || h.status === 'accepted'),
    );
  } else if (view === 'created') {
    filtered = filteredAll.filter((h) => h.handedBy === currentReviewer);
  }

  const hasActiveFilter =
    handoverFilter.keyword ||
    handoverFilter.statuses.length > 0 ||
    handoverFilter.handedBy ||
    handoverFilter.receivedBy;

  const isOverdue = (deadline: string, status: HandoverStatus) => {
    if (status === 'completed') return false;
    try {
      return isBefore(parseISO(deadline), new Date());
    } catch {
      return false;
    }
  };

  const getLockFor = (handoverId: string, anomalyId: string) =>
    handoverLocks.find((l) => l.handoverId === handoverId && l.itemAnomalyId === anomalyId);

  const handleAccept = (handoverId: string) => {
    const res = acceptHandover(handoverId);
    if (!res.success) {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 rounded-md bg-lime-500/30 blur-md" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-md border border-lime-500/40 bg-lime-500/10">
              <ClipboardList className="h-4 w-4 text-lime-300" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">复核交接管理</h2>
            <p className="text-[11px] text-slate-500">
              共 {handoverRecords.length} 条 · 我的待办 {metrics.myPending} · 处理中 {metrics.myAccepted} · 已完成 {metrics.myCompleted}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-slate-600 bg-slate-900/50 p-0.5">
            {(['todo', 'all', 'created'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11px] transition',
                  view === v
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {v === 'todo' ? '我的待办' : v === 'all' ? '全部' : '我创建的'}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportHandoverData('csv')}
            disabled={filtered.length === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            导出 CSV
          </button>
          <button
            onClick={() => exportHandoverData('json')}
            disabled={filtered.length === 0}
            className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileJson className="h-3.5 w-3.5" />
            导出 JSON
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={handoverFilter.keyword}
            onChange={(e) => setHandoverFilter({ keyword: e.target.value })}
            placeholder="搜索标题/交接ID/人员..."
            className="h-8 w-64 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-7 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
          {handoverFilter.keyword && (
            <button
              onClick={() => setHandoverFilter({ keyword: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
          <input
            value={handoverFilter.handedBy}
            onChange={(e) => setHandoverFilter({ handedBy: e.target.value })}
            placeholder="交接人..."
            className="h-8 w-32 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
          <input
            value={handoverFilter.receivedBy}
            onChange={(e) => setHandoverFilter({ receivedBy: e.target.value })}
            placeholder="接收人..."
            className="h-8 w-32 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-slate-400">状态：</span>
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((s) => {
              const active = handoverFilter.statuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10.5px] transition',
                    active
                      ? HANDOVER_STATUS_COLOR[s]
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  {HANDOVER_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>

        {hasActiveFilter && (
          <button
            onClick={resetFilter}
            className="mt-auto flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <RotateCcw className="h-3 w-3" />
            重置筛选
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-slate-700/60">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[11px] text-slate-500">
            {handoverRecords.length === 0
              ? '暂无交接记录，点击顶部「创建交接」开始创建'
              : view === 'todo'
                ? '您当前没有待处理的交接任务 🎉'
                : '当前筛选条件下无匹配的交接记录'}
          </div>
        ) : (
          <div className="divide-y divide-slate-700/40">
            {filtered.map((h) => {
              const isExpanded = expandedIds.has(h.id);
              const overdue = isOverdue(h.deadline, h.status);
              const isMineToProcess =
                h.receivedBy === currentReviewer &&
                (h.status === 'pending' || h.status === 'returned' || h.status === 'accepted');
              const hasConflict = handoverLocks.some((l) => l.handoverId === h.id && l.lockedBy !== currentReviewer);
              return (
                <div key={h.id} className="group">
                  <div
                    onClick={() => toggleExpand(h.id)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-4 py-3 text-[11px] transition hover:bg-slate-700/20',
                      (h.status === 'pending' || h.status === 'returned') &&
                        h.receivedBy === currentReviewer && 'bg-lime-500/5',
                    )}
                  >
                    <button className="flex h-4 w-4 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-200">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>

                    <span className="font-mono text-[11px] text-sky-300">{h.id}</span>
                    <span className="flex-1 truncate text-slate-200">{h.title}</span>

                    <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px]', HANDOVER_STATUS_COLOR[h.status])}>
                      {HANDOVER_STATUS_LABEL[h.status]}
                    </span>

                    <div className="flex items-center gap-1 text-slate-400">
                      <User className="h-2.5 w-2.5" />
                      <span>{h.handedBy}</span>
                      <span className="text-slate-600">→</span>
                      <span
                        className={cn(
                          h.receivedBy === currentReviewer && h.status !== 'completed'
                            ? 'text-sky-300'
                            : '',
                        )}
                      >
                        {h.receivedBy}
                      </span>
                    </div>

                    <div className={cn('flex items-center gap-1', overdue ? 'text-red-400' : 'text-slate-400')}>
                      <Clock className="h-2.5 w-2.5" />
                      <span>{fmtDateTime(h.deadline)}</span>
                      {overdue && (
                        <span title="已逾期">
                          <AlertOctagon className="h-3 w-3" aria-label="已逾期" />
                        </span>
                      )}
                    </div>

                    {hasConflict && (
                      <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
                        <Lock className="h-2.5 w-2.5" />
                        被占用
                      </span>
                    )}

                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {isMineToProcess && h.status !== 'accepted' && (
                        <button
                          onClick={() => handleAccept(h.id)}
                          className="flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[10px] text-teal-300 transition hover:bg-teal-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          接收
                        </button>
                      )}
                      {isMineToProcess && h.status === 'accepted' && (
                        <button
                          onClick={() => setProcessModal({ open: true, handover: h })}
                          className="flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 transition hover:bg-sky-500/20"
                        >
                          <Pencil className="h-3 w-3" />
                          处理
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-700/30 bg-slate-900/40 px-10 py-3">
                      <div className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
                        <div>
                          <span className="text-slate-500">创建时间：</span>
                          <span className="text-slate-300">{fmtDateTime(h.createdAt)}</span>
                        </div>
                        {h.acceptedAt && (
                          <div>
                            <span className="text-slate-500">接收时间：</span>
                            <span className="text-slate-300">{fmtDateTime(h.acceptedAt)}</span>
                          </div>
                        )}
                        {h.returnedAt && (
                          <div>
                            <span className="text-slate-500">退回时间：</span>
                            <span className="text-slate-300">{fmtDateTime(h.returnedAt)}</span>
                          </div>
                        )}
                        {h.completedAt && (
                          <div>
                            <span className="text-slate-500">完成时间：</span>
                            <span className="text-slate-300">{fmtDateTime(h.completedAt)}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-slate-500">交接备注：</span>
                          <span className="text-slate-300">{h.remark || '（无）'}</span>
                        </div>
                        {h.returnReason && (
                          <div className="col-span-2">
                            <span className="text-red-400">退回原因：</span>
                            <span className="text-slate-300">{h.returnReason}</span>
                          </div>
                        )}
                        {h.completedRemark && (
                          <div className="col-span-2">
                            <span className="text-emerald-400">完成备注：</span>
                            <span className="text-slate-300">{h.completedRemark}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-md border border-slate-700/50">
                        <div className="border-b border-slate-700/50 bg-slate-800/40 px-3 py-1.5 text-[10.5px] text-slate-400">
                          异常条目 ({h.items.length})
                        </div>
                        <table className="w-full text-left text-[10.5px]">
                          <thead className="bg-slate-900/40 text-[10px] text-slate-500">
                            <tr>
                              <th className="px-3 py-1.5 font-medium">批次号</th>
                              <th className="px-3 py-1.5 font-medium">异常类型</th>
                              <th className="px-3 py-1.5 font-medium">级别</th>
                              <th className="px-3 py-1.5 font-medium">描述</th>
                              <th className="px-3 py-1.5 font-medium">原复核状态</th>
                              <th className="px-3 py-1.5 font-medium">规则快照</th>
                              <th className="px-3 py-1.5 font-medium">锁定状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/30">
                            {h.items.map((item) => {
                              const lock = getLockFor(h.id, item.anomalyId);
                              return (
                                <tr key={item.anomalyId}>
                                  <td className="px-3 py-1.5 font-mono text-sky-300">{item.batchId}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', ANOMALY_TYPE_COLOR[item.anomalyType])}>
                                      {ANOMALY_TYPE_LABEL[item.anomalyType]}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {item.severity === 'danger' ? (
                                      <span className="inline-flex items-center gap-0.5 text-red-400">
                                        <AlertOctagon className="h-2.5 w-2.5" />
                                        严重
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-amber-400">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        警告
                                      </span>
                                    )}
                                  </td>
                                  <td className="max-w-[280px] truncate px-3 py-1.5 text-slate-300">{item.description}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', CONCLUSION_COLOR[item.originalConclusion])}>
                                      {CONCLUSION_LABEL[item.originalConclusion]}
                                    </span>
                                    {item.originalReviewer && (
                                      <span className="ml-1 text-slate-500">({item.originalReviewer})</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[9.5px] text-slate-500">
                                    阈值{item.rulesSnapshot.overtempThreshold}°C · 缺日志{item.rulesSnapshot.missingLogIntervalMin}分
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {lock ? (
                                      <span
                                        className={cn(
                                          'inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px]',
                                          lock.lockedBy === currentReviewer
                                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                                            : 'border-red-500/30 bg-red-500/10 text-red-300',
                                        )}
                                      >
                                        <Lock className="h-2.5 w-2.5" />
                                        {lock.lockedBy === currentReviewer ? '我锁定' : lock.lockedBy}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
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
        )}
      </div>

      {processModal.handover && (
        <HandoverProcessModal
          open={processModal.open}
          handover={processModal.handover}
          onClose={() => setProcessModal({ open: false, handover: null })}
        />
      )}
    </div>
  );
};

export default HandoverPanel;
