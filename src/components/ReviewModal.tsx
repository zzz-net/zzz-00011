import { useEffect, useState } from 'react';
import { X, Undo2, Swords, User, Calendar, FileText } from 'lucide-react';
import type { FC } from 'react';
import type { ReviewConclusion } from '@/types';
import { useAppStore } from '@/store';
import { CONCLUSION_LABEL, CONCLUSION_COLOR } from '@/services/anomalyEngine';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface ReviewModalProps {
  open: boolean;
  batchId: string;
  onClose: () => void;
}

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return iso;
  }
}

const ReviewModal: FC<ReviewModalProps> = ({ open, batchId, onClose }) => {
  const {
    setReviewDecision,
    undoReviewDecision,
    reviewDecisions,
    reviewHistory,
    manualReviews,
    currentReviewer,
  } = useAppStore();
  const [conclusion, setConclusion] = useState<ReviewConclusion>('unreviewed');
  const [remark, setRemark] = useState('');

  useEffect(() => {
    if (open) {
      const existing = reviewDecisions[batchId];
      setConclusion(existing?.conclusion ?? 'unreviewed');
      setRemark(existing?.remark ?? '');
    }
  }, [open, batchId, reviewDecisions]);

  if (!open) return null;

  const existing = reviewDecisions[batchId];
  const history = reviewHistory[batchId] ?? [];
  const prevEntry = history[history.length - 1];
  const allReviews = manualReviews.filter((r) => r.batchId === batchId);
  const hasConflict = allReviews.length > 1 &&
    new Set(allReviews.map((r) => r.conclusion).filter((c) => c !== 'unreviewed')).size > 1;
  const conflictWithCurrent = existing
    ? allReviews.some(
        (r) => r.conclusion !== existing.conclusion && r.conclusion !== 'unreviewed',
      )
    : false;

  const handleSubmit = () => {
    setReviewDecision(batchId, conclusion, remark);
    onClose();
  };

  const handleUndo = () => {
    undoReviewDecision(batchId);
    if (prevEntry) {
      setConclusion(prevEntry.conclusion);
      setRemark(prevEntry.remark);
    }
  };

  const buttons: { value: ReviewConclusion; label: string; cls: string }[] = [
    { value: 'release', label: '放行', cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400/60' },
    { value: 'quarantine', label: '隔离', cls: 'bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20 hover:border-red-400/60' },
    { value: 'ignore', label: '忽略', cls: 'bg-slate-500/10 border-slate-500/40 text-slate-300 hover:bg-slate-500/20 hover:border-slate-400/60' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">人工复核决策</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">批次号：<span className="font-mono text-slate-300">{batchId}</span></p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {(hasConflict || conflictWithCurrent) && (
            <div className="space-y-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
              <div className="flex items-center gap-1.5">
                <Swords className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-[11.5px] font-semibold text-rose-300">存在复核结论冲突</span>
              </div>
              <div className="overflow-hidden rounded border border-slate-700/40">
                <table className="w-full text-left text-[10.5px]">
                  <thead className="bg-slate-800/60 text-[10px] text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">来源</th>
                      <th className="px-2 py-1.5 font-medium">复核人</th>
                      <th className="px-2 py-1.5 font-medium">结论</th>
                      <th className="px-2 py-1.5 font-medium">时间</th>
                      <th className="px-2 py-1.5 font-medium">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {allReviews.map((r, i) => (
                      <tr key={r.id}>
                        <td className="px-2 py-1.5 text-slate-400">导入 #{i + 1}</td>
                        <td className="px-2 py-1.5 text-slate-300">{r.reviewer}</td>
                        <td className="px-2 py-1.5">
                          <span className={cn('inline-flex rounded border px-1 py-0.5 text-[9.5px]', CONCLUSION_COLOR[r.conclusion])}>
                            {CONCLUSION_LABEL[r.conclusion]}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-400">{fmtDateTime(r.reviewTime)}</td>
                        <td className="px-2 py-1.5 text-slate-400">{r.remark ?? '-'}</td>
                      </tr>
                    ))}
                    {existing && (
                      <tr className="bg-sky-500/5">
                        <td className="px-2 py-1.5 text-sky-400">当前决策</td>
                        <td className="px-2 py-1.5 text-slate-300">{existing.reviewer}</td>
                        <td className="px-2 py-1.5">
                          <span className={cn('inline-flex rounded border px-1 py-0.5 text-[9.5px]', CONCLUSION_COLOR[existing.conclusion])}>
                            {CONCLUSION_LABEL[existing.conclusion]}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-400">{fmtDateTime(existing.updatedAt)}</td>
                        <td className="px-2 py-1.5 text-slate-400">{existing.remark ?? '-'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] leading-tight text-rose-300/80">
                提交下方选择将覆盖当前结论并生成一条撤销记录，或点击"撤销到上一个结论"回退。
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-800/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[11.5px] font-semibold text-slate-300">历史复核记录</span>
                  <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">{history.length} 条</span>
                </div>
                <button
                  onClick={handleUndo}
                  disabled={!prevEntry}
                  className="group flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-3 w-3 transition group-hover:translate-x-[-1px]" />
                  撤销到上一个结论
                </button>
              </div>
              <div className="space-y-1">
                {[...history].reverse().slice(0, 5).map((h, i) => (
                  <div key={h.id} className="flex items-center justify-between rounded bg-slate-900/40 px-2 py-1.5 text-[10.5px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">#{history.length - i}</span>
                      <span className={cn('inline-flex rounded border px-1 py-0.5 text-[9.5px]', CONCLUSION_COLOR[h.conclusion])}>
                        {CONCLUSION_LABEL[h.conclusion]}
                      </span>
                      <span className="text-slate-400">{h.remark || '无备注'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5" />
                        {h.reviewer}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        {fmtDateTime(h.updatedAt)}
                      </span>
                    </div>
                  </div>
                ))}
                {history.length > 5 && (
                  <div className="text-[10px] text-slate-500">另有 {history.length - 5} 条历史记录...</div>
                )}
              </div>
              {prevEntry && (
                <p className="text-[10px] text-amber-300/80">
                  上一条：由 <span className="font-medium">{prevEntry.reviewer}</span> 于 {fmtDateTime(prevEntry.updatedAt)} 给出 <span className="font-medium">{CONCLUSION_LABEL[prevEntry.conclusion]}</span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] text-slate-400">复核结论</label>
            <div className="grid grid-cols-3 gap-2">
              {buttons.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setConclusion(b.value)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs font-medium transition',
                    conclusion === b.value
                      ? `${b.cls} ring-2 ring-offset-1 ring-offset-slate-900`
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200',
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {conclusion !== 'unreviewed' && (
              <div className={cn('mt-2 inline-flex items-center rounded border px-2 py-0.5 text-[10px]', CONCLUSION_COLOR[conclusion])}>
                当前选择：{CONCLUSION_LABEL[conclusion]}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] text-slate-400">复核备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={4}
              placeholder="请输入复核备注（可选）..."
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950/50 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>复核人：<span className="text-slate-300">{currentReviewer || '未设置'}</span></span>
            <span>更新时间将自动记录</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={conclusion === 'unreviewed'}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            确认提交（保留当前结论）
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
