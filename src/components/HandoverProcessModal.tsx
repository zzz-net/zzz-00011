import { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Undo2,
  AlertTriangle,
  AlertOctagon,
  Lock,
  User,
} from 'lucide-react';
import { useAppStore } from '@/store';
import {
  ANOMALY_TYPE_LABEL,
  ANOMALY_TYPE_COLOR,
  CONCLUSION_LABEL,
  CONCLUSION_COLOR,
} from '@/services/anomalyEngine';
import type { FC } from 'react';
import type { HandoverRecord, ReviewConclusion } from '@/types';
import { cn } from '@/lib/utils';

interface HandoverProcessModalProps {
  open: boolean;
  handover: HandoverRecord;
  onClose: () => void;
}

type ItemDecision = {
  conclusion: ReviewConclusion;
  remark: string;
};

const HandoverProcessModal: FC<HandoverProcessModalProps> = ({ open, handover, onClose }) => {
  const {
    currentReviewer,
    returnHandover,
    completeHandover,
    acquireItemLock,
    releaseItemLock,
    handoverLocks,
  } = useAppStore();

  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [returnReason, setReturnReason] = useState('');
  const [showReturn, setShowReturn] = useState(false);
  const [completeRemark, setCompleteRemark] = useState('');
  const [conflictAlerts, setConflictAlerts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, ItemDecision> = {};
    for (const item of handover.items) {
      initial[item.anomalyId] = {
        conclusion: item.originalConclusion,
        remark: '',
      };
    }
    setDecisions(initial);
    setConflictAlerts({});
    setShowReturn(false);
    setReturnReason('');
    setCompleteRemark('');

    return () => {
      for (const item of handover.items) {
        releaseItemLock(handover.id, item.anomalyId);
      }
    };
  }, [open, handover, releaseItemLock]);

  const getLock = (anomalyId: string) =>
    handoverLocks.find(
      (l) => l.handoverId === handover.id && l.itemAnomalyId === anomalyId,
    );

  const handleItemFocus = (anomalyId: string) => {
    const res = acquireItemLock(handover.id, anomalyId);
    if (!res.success && res.lockedBy) {
      setConflictAlerts((prev) => ({
        ...prev,
        [anomalyId]: `该条目正在被 ${res.lockedBy} 处理，您的修改可能会产生冲突`,
      }));
    } else {
      setConflictAlerts((prev) => {
        const next = { ...prev };
        delete next[anomalyId];
        return next;
      });
    }
  };

  const updateDecision = (anomalyId: string, field: keyof ItemDecision, value: string) => {
    setDecisions((prev) => ({
      ...prev,
      [anomalyId]: {
        ...prev[anomalyId],
        [field]: value,
      },
    }));
  };

  const handleReturn = () => {
    if (!returnReason.trim()) {
      alert('请填写退回原因');
      return;
    }
    setSubmitting(true);
    const res = returnHandover(handover.id, returnReason.trim());
    setSubmitting(false);
    if (res.success) {
      onClose();
    } else {
      alert(res.message);
    }
  };

  const handleComplete = () => {
    const hasConflicts = Object.keys(conflictAlerts).length > 0;
    if (hasConflicts) {
      const confirmed = confirm(
        '检测到有其他人员正在处理部分条目，继续提交可能覆盖他人结论。是否确认继续？',
      );
      if (!confirmed) return;
    }
    const decisionList = Object.entries(decisions).map(([anomalyId, d]) => {
      const item = handover.items.find((i) => i.anomalyId === anomalyId);
      return {
        batchId: item!.batchId,
        conclusion: d.conclusion as ReviewConclusion,
        remark: d.remark || completeRemark,
      };
    });
    setSubmitting(true);
    const res = completeHandover(handover.id, completeRemark.trim(), decisionList);
    setSubmitting(false);
    if (res.success) {
      onClose();
    } else {
      alert(res.message);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">处理交接任务</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {handover.id} · 交接人：{handover.handedBy} · 接收人：
              <span className="text-sky-300">{handover.receivedBy}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {handover.remark && (
            <div className="mb-4 rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-[11.5px] text-sky-200">
              <strong className="text-sky-300">交接备注：</strong>
              {handover.remark}
            </div>
          )}

          {showReturn ? (
            <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <h3 className="text-[12px] font-semibold text-red-300">退回交接任务</h3>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">退回原因 *</label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={4}
                  placeholder="请详细说明退回原因，如：信息不完整、需要补充材料等"
                  className="w-full resize-none rounded-md border border-slate-600 bg-slate-900/50 px-2.5 py-2 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-red-500/60 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReturn(false)}
                  className="rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:bg-slate-700/60"
                >
                  取消
                </button>
                <button
                  onClick={handleReturn}
                  disabled={!returnReason.trim() || submitting}
                  className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  确认退回
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-700/60">
                <div className="border-b border-slate-700/60 bg-slate-800/40 px-4 py-2 text-[11px] text-slate-400">
                  复核结论（共 {handover.items.length} 条）
                </div>
                <div className="divide-y divide-slate-700/40">
                  {handover.items.map((item) => {
                    const lock = getLock(item.anomalyId);
                    const conflict = conflictAlerts[item.anomalyId];
                    const d = decisions[item.anomalyId];
                    return (
                      <div
                        key={item.anomalyId}
                        className={cn(
                          'space-y-2 p-3',
                          conflict && 'border-l-2 border-red-500 bg-red-500/5',
                        )}
                        onClick={() => handleItemFocus(item.anomalyId)}
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[12px] text-sky-300">{item.batchId}</span>
                              <span className={cn('inline-flex rounded border px-1 py-0.5 text-[10px]', ANOMALY_TYPE_COLOR[item.anomalyType])}>
                                {ANOMALY_TYPE_LABEL[item.anomalyType]}
                              </span>
                              {item.severity === 'danger' ? (
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
                              {lock && (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px]',
                                    lock.lockedBy === currentReviewer
                                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                                      : 'border-red-500/30 bg-red-500/10 text-red-300',
                                  )}
                                >
                                  <Lock className="h-2.5 w-2.5" />
                                  {lock.lockedBy === currentReviewer ? '我锁定' : `${lock.lockedBy} 锁定`}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-300">{item.description}</p>
                            <div className="mt-1 text-[10.5px] text-slate-500">
                              原状态：
                              <span className={cn('mx-1 rounded border px-1 py-0.5 text-[10px]', CONCLUSION_COLOR[item.originalConclusion])}>
                                {CONCLUSION_LABEL[item.originalConclusion]}
                              </span>
                              {item.originalReviewer && (
                                <>
                                  · <User className="mr-0.5 inline h-2.5 w-2.5" />
                                  {item.originalReviewer}
                                </>
                              )}
                              {item.originalRemark && ` · 原备注：${item.originalRemark}`}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            {(['release', 'quarantine', 'ignore'] as const).map((c) => (
                              <button
                                key={c}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateDecision(item.anomalyId, 'conclusion', c);
                                }}
                                className={cn(
                                  'rounded border px-2 py-1 text-[10.5px] transition',
                                  d?.conclusion === c
                                    ? CONCLUSION_COLOR[c]
                                    : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                                )}
                              >
                                {CONCLUSION_LABEL[c]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <input
                          value={d?.remark || ''}
                          onChange={(e) => updateDecision(item.anomalyId, 'remark', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="填写复核备注（可选）"
                          className="h-7 w-full rounded-md border border-slate-600 bg-slate-900/50 px-2.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
                        />

                        {conflict && (
                          <div className="flex items-start gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[10.5px] text-red-300">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{conflict}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-400">整体完成备注（可选）</label>
                <textarea
                  value={completeRemark}
                  onChange={(e) => setCompleteRemark(e.target.value)}
                  rows={2}
                  placeholder="可填写整体说明，如：本次交接复核完成，所有异常均已按规则处理"
                  className="w-full resize-none rounded-md border border-slate-600 bg-slate-900/50 px-2.5 py-2 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-700/60 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            {showReturn
              ? '填写退回原因后提交，任务将退回到交接人'
              : '选择每条异常的复核结论，或批量退回交接任务'}
          </div>
          <div className="flex gap-2">
            {!showReturn && (
              <button
                onClick={() => setShowReturn(true)}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11.5px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                退回交接
              </button>
            )}
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:bg-slate-700/60 disabled:opacity-50"
            >
              取消
            </button>
            {!showReturn && (
              <button
                onClick={handleComplete}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                提交完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandoverProcessModal;
