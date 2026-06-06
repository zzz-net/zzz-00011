import { AlertTriangle, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import type { FC } from 'react';
import type { ReviewConflict } from '@/types';

interface ReviewConflictModalProps {
  open: boolean;
  onClose: () => void;
}

const CONFLICT_ICON = {
  warning: AlertTriangle,
  danger: AlertCircle,
};

const CONFLICT_COLOR = {
  warning: 'border-amber-500/40 bg-amber-500/5',
  danger: 'border-rose-500/40 bg-rose-500/5',
};

const ReviewConflictModal: FC<ReviewConflictModalProps> = ({ open, onClose }) => {
  const { pendingReviewConflicts, resolvePendingReviewConflict, clearPendingReviewConflicts } =
    useAppStore();

  if (!open || pendingReviewConflicts.length === 0) return null;

  const handleResolve = (conflict: ReviewConflict, optionKey: string) => {
    const targetReviewId = conflict.relatedReviewIds[0];
    resolvePendingReviewConflict(conflict.id, optionKey, targetReviewId);
  };

  const handleSkipAll = () => {
    clearPendingReviewConflicts();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={18} />
            <h3 className="text-base font-semibold text-slate-100">复盘冲突确认</h3>
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
              {pendingReviewConflicts.length} 项待处理
            </span>
          </div>
          <button
            onClick={handleSkipAll}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="全部跳过"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-slate-400">
            创建复盘单时检测到以下问题，请逐项确认处理方式，系统<span className="text-amber-300">不会静默覆盖</span>任何数据。
          </p>
          {pendingReviewConflicts.map((conflict) => {
            const Icon = CONFLICT_ICON[conflict.severity];
            return (
              <div
                key={conflict.id}
                className={cn(
                  'rounded-lg border p-4',
                  CONFLICT_COLOR[conflict.severity],
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={cn(
                      'mt-0.5 shrink-0',
                      conflict.severity === 'danger' ? 'text-rose-400' : 'text-amber-400',
                    )}
                    size={18}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">{conflict.title}</h4>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px]',
                          conflict.severity === 'danger'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300',
                        )}
                      >
                        {conflict.severity === 'danger' ? '高风险' : '提示'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{conflict.description}</p>

                    {conflict.relatedBatchIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {conflict.relatedBatchIds.map((bid) => (
                          <span
                            key={bid}
                            className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                          >
                            {bid}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 space-y-1.5">
                      {conflict.options.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => handleResolve(conflict, opt.key)}
                          className={cn(
                            'w-full flex items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition',
                            opt.isRecommended
                              ? 'border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20'
                              : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800',
                          )}
                        >
                          {opt.isRecommended && (
                            <CheckCircle2 className="mt-0.5 text-sky-400 shrink-0" size={14} />
                          )}
                          <div className="flex-1">
                            <div
                              className={cn(
                                'font-medium',
                                opt.isRecommended ? 'text-sky-200' : 'text-slate-200',
                              )}
                            >
                              {opt.label}
                              {opt.isRecommended && (
                                <span className="ml-1.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
                                  推荐
                                </span>
                              )}
                            </div>
                            {opt.description && (
                              <p className="mt-0.5 text-[11px] text-slate-400">{opt.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <span className="text-[11px] text-slate-500 mr-auto">
            未处理的冲突会保留在队列中，下次打开复盘工作台时仍会提示
          </span>
          <button
            onClick={handleSkipAll}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            稍后处理
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewConflictModal;
