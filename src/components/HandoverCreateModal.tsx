import { useState, useMemo } from 'react';
import {
  X,
  Send,
  Search,
  AlertTriangle,
  AlertOctagon,
  Filter,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store';
import {
  ANOMALY_TYPE_LABEL,
  ANOMALY_TYPE_COLOR,
  CONCLUSION_LABEL,
  CONCLUSION_COLOR,
} from '@/services/anomalyEngine';
import type { FC } from 'react';
import type { AnomalyType, AnomalySeverity, ReviewConclusion } from '@/types';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

interface HandoverCreateModalProps {
  open: boolean;
  onClose: () => void;
}

const ANOMALY_TYPES: AnomalyType[] = ['overtemp', 'missing_log', 'unregistered', 'review_conflict'];
const SEVERITIES: AnomalySeverity[] = ['warning', 'danger'];
const REVIEW_STATUSES: ReviewConclusion[] = ['unreviewed', 'release', 'quarantine', 'ignore'];

const HandoverCreateModal: FC<HandoverCreateModalProps> = ({ open, onClose }) => {
  const {
    anomalies,
    reviewDecisions,
    createHandover,
    currentReviewer,
  } = useAppStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [remark, setRemark] = useState('');
  const [deadline, setDeadline] = useState(() =>
    format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [selTypes, setSelTypes] = useState<AnomalyType[]>([]);
  const [selSeverities, setSelSeverities] = useState<AnomalySeverity[]>([]);
  const [selStatuses, setSelStatuses] = useState<ReviewConclusion[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return anomalies.filter((a) => {
      if (batchSearch && !a.batchId.toLowerCase().includes(batchSearch.toLowerCase())) {
        return false;
      }
      if (selTypes.length > 0 && !selTypes.includes(a.type)) return false;
      if (selSeverities.length > 0 && !selSeverities.includes(a.severity)) return false;
      if (selStatuses.length > 0) {
        const st = reviewDecisions[a.batchId]?.conclusion ?? 'unreviewed';
        if (!selStatuses.includes(st)) return false;
      }
      return true;
    });
  }, [anomalies, reviewDecisions, batchSearch, selTypes, selSeverities, selStatuses]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  const toggleType = (t: AnomalyType) => {
    setSelTypes(selTypes.includes(t) ? selTypes.filter((x) => x !== t) : [...selTypes, t]);
  };
  const toggleSev = (s: AnomalySeverity) => {
    setSelSeverities(
      selSeverities.includes(s) ? selSeverities.filter((x) => x !== s) : [...selSeverities, s],
    );
  };
  const toggleStatus = (s: ReviewConclusion) => {
    setSelStatuses(
      selStatuses.includes(s) ? selStatuses.filter((x) => x !== s) : [...selStatuses, s],
    );
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());
  const resetFilters = () => {
    setBatchSearch('');
    setSelTypes([]);
    setSelSeverities([]);
    setSelStatuses([]);
  };

  const handleSubmit = () => {
    if (selectedIds.size === 0) return;
    if (!receivedBy.trim()) return;
    setSubmitting(true);
    const rec = createHandover({
      title: title.trim(),
      anomalyIds: Array.from(selectedIds),
      receivedBy: receivedBy.trim(),
      remark: remark.trim(),
      deadline: new Date(deadline).toISOString(),
    });
    setSubmitting(false);
    if (rec) {
      setSelectedIds(new Set());
      setTitle('');
      setReceivedBy('');
      setRemark('');
      setDeadline(format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">创建复核交接清单</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              筛选并勾选需要交接的异常条目，填写接收人与截止时间
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-300">筛选异常：</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                <input
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  placeholder="批次号..."
                  className="h-7 w-36 rounded-md border border-slate-600 bg-slate-900/50 pl-7 pr-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {ANOMALY_TYPES.map((t) => {
                  const active = selTypes.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleType(t)}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[10px] transition',
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
              <div className="flex flex-wrap gap-1">
                {SEVERITIES.map((s) => {
                  const active = selSeverities.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSev(s)}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[10px] transition',
                        active
                          ? s === 'danger'
                            ? 'border-red-500/60 bg-red-500/15 text-red-200'
                            : 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                          : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                      )}
                    >
                      {s === 'danger' ? '严重' : '警告'}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {REVIEW_STATUSES.map((s) => {
                  const active = selStatuses.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[10px] transition',
                        active
                          ? CONCLUSION_COLOR[s]
                          : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                      )}
                    >
                      {CONCLUSION_LABEL[s]}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={resetFilters}
                className="ml-auto flex items-center gap-1 rounded border border-slate-600 bg-slate-900/40 px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                重置
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                共 <span className="text-slate-200">{filtered.length}</span> 条异常，已选
                <span className="text-sky-300"> {selectedIds.size}</span> 条
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={selectAll}
                  disabled={filtered.length === 0}
                  className="rounded border border-slate-600 bg-slate-900/40 px-2 py-0.5 text-[10px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:opacity-40"
                >
                  全选当前
                </button>
                <button
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                  className="rounded border border-slate-600 bg-slate-900/40 px-2 py-0.5 text-[10px] text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                >
                  清空勾选
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-700/60">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-900/80 text-[10px] uppercase text-slate-400 backdrop-blur">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2 font-medium">批次号</th>
                    <th className="px-2 py-2 font-medium">异常类型</th>
                    <th className="px-2 py-2 font-medium">级别</th>
                    <th className="px-2 py-2 font-medium">描述</th>
                    <th className="px-2 py-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[11px] text-slate-500">
                        无匹配的异常
                      </td>
                    </tr>
                  ) : (
                    filtered.map((a) => {
                      const checked = selectedIds.has(a.id);
                      const decision = reviewDecisions[a.batchId];
                      const expanded = expandedRows.has(a.id);
                      return (
                        <>
                          <tr
                            key={a.id}
                            className={cn(
                              'cursor-pointer transition hover:bg-slate-700/20',
                              checked && 'bg-sky-500/5',
                            )}
                            onClick={() => toggle(a.id)}
                          >
                            <td className="px-2 py-2">
                              <div
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded border transition',
                                  checked
                                    ? 'border-sky-500 bg-sky-500 text-white'
                                    : 'border-slate-600 bg-slate-900/60',
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(a.id);
                                }}
                              >
                                {checked && <Check className="h-2.5 w-2.5" />}
                              </div>
                            </td>
                            <td
                              className="px-2 py-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(a.id);
                              }}
                            >
                              <button className="text-slate-400 hover:text-slate-200">
                                {expanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 py-2 font-mono text-[11px] text-sky-300">{a.batchId}</td>
                            <td className="px-2 py-2">
                              <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', ANOMALY_TYPE_COLOR[a.type])}>
                                {ANOMALY_TYPE_LABEL[a.type]}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              {a.severity === 'danger' ? (
                                <span className="inline-flex items-center gap-0.5 text-red-400">
                                  <AlertOctagon className="h-3 w-3" />
                                  <span className="text-[10px]">严重</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span className="text-[10px]">警告</span>
                                </span>
                              )}
                            </td>
                            <td className="max-w-[300px] truncate px-2 py-2 text-[11px] text-slate-300">{a.description}</td>
                            <td className="px-2 py-2">
                              <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', CONCLUSION_COLOR[decision?.conclusion ?? 'unreviewed'])}>
                                {CONCLUSION_LABEL[decision?.conclusion ?? 'unreviewed']}
                              </span>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-slate-900/60">
                              <td colSpan={7} className="px-8 py-2 text-[10.5px] text-slate-400">
                                原始行号：{a.sourceRows.join(', ')}
                                {decision?.reviewer && ` · 原复核人：${decision.reviewer}`}
                                {decision?.remark && ` · 原备注：${decision.remark}`}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-800/30 p-4">
            <h3 className="text-[12px] font-semibold text-slate-200">交接信息</h3>

            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400">交接标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：6月6日中班待复核异常"
                className="h-8 w-full rounded-md border border-slate-600 bg-slate-900/50 px-2.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400">
                接收人 <span className="text-red-400">*</span>
              </label>
              <input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="接收人姓名"
                className="h-8 w-full rounded-md border border-slate-600 bg-slate-900/50 px-2.5 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400">
                截止时间 <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-8 w-full rounded-md border border-slate-600 bg-slate-900/50 px-2.5 text-[12px] text-slate-200 focus:border-sky-500/60 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400">交接备注</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={4}
                placeholder="请输入交接说明、特别注意事项等"
                className="w-full resize-none rounded-md border border-slate-600 bg-slate-900/50 px-2.5 py-2 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
              />
            </div>

            <div className="mt-auto space-y-3 rounded-md border border-slate-700/60 bg-slate-900/40 p-3 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>交接人</span>
                <span className="text-slate-200">{currentReviewer || '未设置'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>条目数</span>
                <span className="text-sky-300">{selectedIds.size}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 text-[12px] text-slate-300 transition hover:border-slate-500 hover:bg-slate-700/60"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={selectedIds.size === 0 || !receivedBy.trim() || submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-[12px] font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
              >
                <Send className="h-3.5 w-3.5" />
                创建交接
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandoverCreateModal;
