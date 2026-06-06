import { useMemo, useState } from 'react';
import {
  FileSearch,
  Plus,
  FileSpreadsheet,
  FileJson,
  Settings2,
  ChevronRight,
  Search,
  Trash2,
  AlertTriangle,
  User,
  Calendar,
  ClipboardList,
  Clock,
} from 'lucide-react';
import { useAppStore, applyReviewFilters, getReviewMetrics } from '@/store';
import {
  REVIEW_SEVERITY_LABEL,
  REVIEW_SEVERITY_COLOR,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_COLOR,
  REVIEW_NODE_TYPE_LABEL,
} from '@/types';
import type {
  ReviewSeverityLevel,
  ReviewStatus,
  ReviewRecord,
  ReviewNode,
  ArrivalBatch,
  ReviewTemplate,
} from '@/types';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { FC } from 'react';
import ReviewTemplateModal from './ReviewTemplateModal';
import ReviewConflictModal from './ReviewConflictModal';
import ReviewDetailView from './ReviewDetailView';

interface ReviewWorkbenchProps {
  onBack?: () => void;
  initialReviewId?: string;
}

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm');
  } catch {
    return iso;
  }
}

const ReviewWorkbench: FC<ReviewWorkbenchProps> = ({ onBack, initialReviewId }) => {
  const {
    reviewRecords,
    reviewTemplates,
    reviewFilter,
    setReviewFilter,
    pendingReviewConflicts,
    createReview,
    setReviewStatus,
    deleteReview,
    exportReviewData,
    arrivalBatches,
    anomalies,
  } = useAppStore();

  const [templateOpen, setTemplateOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(pendingReviewConflicts.length > 0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-default');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [createTitle, setCreateTitle] = useState('');
  const [activeReview, setActiveReview] = useState<ReviewRecord | null>(
    initialReviewId ? reviewRecords.find((r) => r.id === initialReviewId) ?? null : null,
  );

  const metrics = useMemo(() => getReviewMetrics(reviewRecords), [reviewRecords]);
  const filtered = useMemo(
    () => applyReviewFilters(reviewRecords, reviewFilter),
    [reviewRecords, reviewFilter],
  );

  const batchesWithAnomalies = useMemo(() => {
    const anomalyBatches = new Set(anomalies.map((a) => a.batchId));
    return arrivalBatches.filter((b) => anomalyBatches.has(b.batchId));
  }, [arrivalBatches, anomalies]);

  const toggleSeverity = (s: ReviewSeverityLevel) => {
    const list = reviewFilter.severities.includes(s)
      ? reviewFilter.severities.filter((x) => x !== s)
      : [...reviewFilter.severities, s];
    setReviewFilter({ severities: list });
  };

  const toggleStatus = (s: ReviewStatus) => {
    const list = reviewFilter.statuses.includes(s)
      ? reviewFilter.statuses.filter((x) => x !== s)
      : [...reviewFilter.statuses, s];
    setReviewFilter({ statuses: list });
  };

  const toggleBatch = (bid: string) => {
    const next = new Set(selectedBatchIds);
    if (next.has(bid)) next.delete(bid);
    else next.add(bid);
    setSelectedBatchIds(next);
  };

  const handleCreate = () => {
    if (selectedBatchIds.size === 0) return;
    const record = createReview({
      batchIds: Array.from(selectedBatchIds),
      templateId: selectedTemplateId,
      title: createTitle.trim() || undefined,
    });
    setCreateOpen(false);
    setSelectedBatchIds(new Set());
    setCreateTitle('');
    if (record) {
      setActiveReview(record);
    }
    if (pendingReviewConflicts.length > 0) {
      setConflictOpen(true);
    }
  };

  if (activeReview) {
    return (
      <ReviewDetailView
        review={activeReview}
        onBack={() => setActiveReview(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.08),transparent)]" />

      <div className="relative mx-auto max-w-[1600px] px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                ← 返回看板
              </button>
            )}
            <div className="flex items-center gap-2">
              <ClipboardList className="text-sky-400" size={22} />
              <h1 className="text-xl font-semibold tracking-tight">温控异常复盘工作台</h1>
            </div>
            {pendingReviewConflicts.length > 0 && (
              <button
                onClick={() => setConflictOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20"
              >
                <AlertTriangle size={14} /> {pendingReviewConflicts.length} 项冲突待处理
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTemplateOpen(true)}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              <Settings2 size={14} /> 模板配置
            </button>
            <button
              onClick={() => exportReviewData('csv')}
              className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
            >
              <FileSpreadsheet size={14} /> 导出 CSV
            </button>
            <button
              onClick={() => exportReviewData('json')}
              className="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20"
            >
              <FileJson size={14} /> 导出 JSON
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400"
            >
              <Plus size={14} /> 新建复盘单
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-5">
          {(['draft', 'in_progress', 'completed', 'archived'] as ReviewStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                'rounded-lg border p-3 text-left transition',
                reviewFilter.statuses.includes(s)
                  ? 'border-sky-500/60 bg-sky-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700',
              )}
            >
              <div className="text-[11px] text-slate-400">{REVIEW_STATUS_LABEL[s]}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-slate-100">{metrics.byStatus[s]}</span>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', REVIEW_STATUS_COLOR[s])}>
                  {REVIEW_STATUS_LABEL[s]}
                </span>
              </div>
            </button>
          ))}
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-400">复盘单总数</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">{metrics.total}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                value={reviewFilter.keyword}
                onChange={(e) => setReviewFilter({ keyword: e.target.value })}
                placeholder="搜索复盘标题 / ID / 批次号..."
                className="w-full rounded-md border border-slate-700 bg-slate-950/50 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">级别：</span>
              {(['minor', 'moderate', 'major', 'critical'] as ReviewSeverityLevel[]).map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSeverity(s)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition',
                    REVIEW_SEVERITY_COLOR[s],
                    reviewFilter.severities.includes(s)
                      ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/30'
                      : 'opacity-60 hover:opacity-100',
                  )}
                >
                  {REVIEW_SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">创建人：</span>
              <input
                type="text"
                value={reviewFilter.createdBy}
                onChange={(e) => setReviewFilter({ createdBy: e.target.value })}
                placeholder="姓名"
                className="w-28 rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() =>
                setReviewFilter({
                  keyword: '',
                  severities: [],
                  statuses: [],
                  batchId: '',
                  supplierName: '',
                  createdBy: '',
                  startDate: '',
                  endDate: '',
                })
              }
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              重置筛选
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">复盘单列表</h2>
            <span className="text-[11px] text-slate-500">
              显示 {filtered.length} / {reviewRecords.length} 条 · 点击行展开详情
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/20 py-16 text-center">
              <FileSearch className="mx-auto mb-3 text-slate-600" size={40} />
              <p className="text-sm text-slate-400">暂无复盘单</p>
              <p className="mt-1 text-xs text-slate-500">
                点击右上角「新建复盘单」从异常批次开始创建
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <ReviewRow
                  key={r.id}
                  record={r}
                  onOpen={() => setActiveReview(r)}
                  onStatusChange={(s) => setReviewStatus(r.id, s)}
                  onDelete={() => {
                    if (confirm(`确定删除复盘单 "${r.title}" 吗？`)) deleteReview(r.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateReviewModal
          open={createOpen}
          onClose={() => {
            setCreateOpen(false);
            setSelectedBatchIds(new Set());
            setCreateTitle('');
          }}
          templates={reviewTemplates}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={setSelectedTemplateId}
          batches={batchesWithAnomalies}
          selectedBatchIds={selectedBatchIds}
          onBatchToggle={toggleBatch}
          title={createTitle}
          onTitleChange={setCreateTitle}
          onCreate={handleCreate}
        />
      )}

      <ReviewTemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
      <ReviewConflictModal open={conflictOpen} onClose={() => setConflictOpen(false)} />
    </div>
  );
};

interface ReviewRowProps {
  record: ReviewRecord;
  onOpen: () => void;
  onStatusChange: (s: ReviewStatus) => void;
  onDelete: () => void;
}

const ReviewRow: FC<ReviewRowProps> = ({ record, onOpen, onStatusChange, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const dispositionNode = record.nodes.find((n) => n.nodeType === 'disposition');

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-800/40"
      >
        <ChevronRight
          className={cn(
            'text-slate-500 transition-transform shrink-0',
            expanded && 'rotate-90',
          )}
          size={16}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-500">{record.id}</span>
            <span className="text-sm font-medium text-slate-100 truncate">{record.title}</span>
            <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', REVIEW_SEVERITY_COLOR[record.severity])}>
              {REVIEW_SEVERITY_LABEL[record.severity]}
            </span>
            <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', REVIEW_STATUS_COLOR[record.status])}>
              {REVIEW_STATUS_LABEL[record.status]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <User size={11} /> {record.createdBy}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={11} /> {fmtDateTime(record.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {fmtDateTime(record.updatedAt)}
            </span>
            <span>批次 {record.batchIds.length}</span>
            <span>节点 {record.nodes.length}</span>
            {record.supplierName && <span>供应商：{record.supplierName}</span>}
            {dispositionNode?.conclusion && (
              <span>结论：{dispositionNode.conclusion}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <select
            value={record.status}
            onChange={(e) => onStatusChange(e.target.value as ReviewStatus)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
          >
            {(['draft', 'in_progress', 'completed', 'archived'] as ReviewStatus[]).map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            onClick={onOpen}
            className="rounded bg-sky-500/20 px-2.5 py-1 text-[11px] text-sky-300 hover:bg-sky-500/30"
          >
            查看
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-800 bg-slate-950/40 px-14 py-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {record.batchIds.map((bid) => (
              <span
                key={bid}
                className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 font-mono text-[10px] text-slate-300"
              >
                {bid}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {record.nodes.slice(0, 6).map((n: ReviewNode) => (
              <span
                key={n.id}
                className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300"
              >
                <span>{REVIEW_NODE_TYPE_LABEL[n.nodeType]}</span>
                {n.severity && (
                  <span className={cn('px-1 rounded', REVIEW_SEVERITY_COLOR[n.severity])}>
                    {REVIEW_SEVERITY_LABEL[n.severity]}
                  </span>
                )}
              </span>
            ))}
            {record.nodes.length > 6 && (
              <span className="text-[10px] text-slate-500 self-center">
                +{record.nodes.length - 6} 更多
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface CreateReviewModalProps {
  open: boolean;
  onClose: () => void;
  templates: ReviewTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  batches: ArrivalBatch[];
  selectedBatchIds: Set<string>;
  onBatchToggle: (bid: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  onCreate: () => void;
}

const CreateReviewModal: FC<CreateReviewModalProps> = ({
  open,
  onClose,
  templates,
  selectedTemplateId,
  onTemplateChange,
  batches,
  selectedBatchIds,
  onBatchToggle,
  title,
  onTitleChange,
  onCreate,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-100">新建复盘单</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">复盘模板</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.nodes.length} 节点）
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                复盘标题（可选）
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="留空则自动生成"
                className="w-full rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                选择异常批次（{selectedBatchIds.size} 个已选）
              </label>
              <button
                onClick={() => {
                  const all = new Set(batches.map((b) => b.batchId));
                  if (selectedBatchIds.size === all.size) {
                    batches.forEach((b) => selectedBatchIds.has(b.batchId) && onBatchToggle(b.batchId));
                  } else {
                    batches.forEach((b) => !selectedBatchIds.has(b.batchId) && onBatchToggle(b.batchId));
                  }
                }}
                className="text-[11px] text-sky-400 hover:text-sky-300"
              >
                {selectedBatchIds.size === batches.length ? '全不选' : '全选'}
              </button>
            </div>
            {batches.length === 0 ? (
              <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
                暂无可复盘的异常批次。请先在看板导入到货、温度日志等数据生成异常。
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 divide-y divide-slate-800">
                {batches.map((b) => (
                  <label
                    key={b.batchId}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBatchIds.has(b.batchId)}
                      onChange={() => onBatchToggle(b.batchId)}
                      className="rounded border-slate-600 bg-slate-900"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-300">{b.batchId}</span>
                        <span className="text-xs text-slate-200">{b.productName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {b.supplier || '供应商未知'} · 到货 {fmtDateTime(b.arrivalTime)} · 要求 {b.requiredTempMin}~{b.requiredTempMax}°C
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={selectedBatchIds.size === 0}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-40"
          >
            创建复盘单
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewWorkbench;
