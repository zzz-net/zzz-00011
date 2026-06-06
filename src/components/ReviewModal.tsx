import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { FC } from 'react';
import type { ReviewConclusion } from '@/types';
import { useAppStore } from '@/store';
import { CONCLUSION_LABEL, CONCLUSION_COLOR } from '@/services/anomalyEngine';
import { cn } from '@/lib/utils';

interface ReviewModalProps {
  open: boolean;
  batchId: string;
  onClose: () => void;
}

const ReviewModal: FC<ReviewModalProps> = ({ open, batchId, onClose }) => {
  const { setReviewDecision, reviewDecisions, currentReviewer } = useAppStore();
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

  const handleSubmit = () => {
    setReviewDecision(batchId, conclusion, remark);
    onClose();
  };

  const buttons: { value: ReviewConclusion; label: string; cls: string }[] = [
    { value: 'release', label: '放行', cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400/60' },
    { value: 'quarantine', label: '隔离', cls: 'bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/20 hover:border-red-400/60' },
    { value: 'ignore', label: '忽略', cls: 'bg-slate-500/10 border-slate-500/40 text-slate-300 hover:bg-slate-500/20 hover:border-slate-400/60' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
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

        <div className="space-y-4 p-5">
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
            确认提交
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
