import { useState, useMemo } from 'react';
import {
  X,
  Check,
  XCircle,
  Flag,
  Users,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Hash,
} from 'lucide-react';
import { useAppStore } from '@/store';
import type { FC } from 'react';
import type { SupplierNameConflict } from '@/types';
import {
  detectSupplierNameConflicts,
  normalizeSupplierName,
} from '@/services/supplierRiskService';
import { cn } from '@/lib/utils';

interface SupplierNameConflictModalProps {
  open: boolean;
  onClose: () => void;
}

const SupplierNameConflictModal: FC<SupplierNameConflictModalProps> = ({ open, onClose }) => {
  const {
    arrivalBatches,
    supplierNameResolution,
    resolveSupplierNameConflict,
  } = useAppStore();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  const conflicts = useMemo(
    () => detectSupplierNameConflicts(arrivalBatches, supplierNameResolution).conflicts.filter((c) => !c.resolved),
    [arrivalBatches, supplierNameResolution],
  );

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleMerge = (conflict: SupplierNameConflict, useCustom = false) => {
    const canonical = useCustom && customNames[conflict.id]?.trim()
      ? customNames[conflict.id].trim()
      : undefined;
    resolveSupplierNameConflict(conflict.id, true, canonical);
  };

  const handleKeepSeparate = (conflict: SupplierNameConflict) => {
    resolveSupplierNameConflict(conflict.id, false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10">
              <Flag className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">供应商名称冲突确认</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                检测到 {conflicts.length} 组可能的同名变体，请确认是否合并
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {conflicts.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-emerald-400/60" />
              <p className="mt-3 text-[12px] text-slate-400">
                暂无待确认的名称冲突 ✓
              </p>
              <p className="mt-1 text-[10.5px] text-slate-500">
                所有供应商名称已规范化
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                  <div className="text-[10.5px] text-sky-200/90 leading-relaxed">
                    以下供应商名称可能是同一主体的不同写法（仅大小写或空格不同）。
                    <br />
                    <strong>合并</strong>：将所有变体归一到同一供应商下统计异常和风险。
                    <br />
                    <strong>保留独立</strong>：标记为不同供应商，后续不再提示该组冲突。
                  </div>
                </div>
              </div>

              {conflicts.map((conflict) => {
                const isExpanded = expandedIds.has(conflict.id);
                const totalBatches = Object.values(conflict.batchIdsByVariant).reduce(
                  (s, arr) => s + arr.length,
                  0,
                );
                const customName = customNames[conflict.id] ?? '';
                const normalizedKey = normalizeSupplierName(conflict.variants[0]);

                return (
                  <div
                    key={conflict.id}
                    className="overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/30"
                  >
                    <div
                      onClick={() => toggleExpand(conflict.id)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-slate-700/20"
                    >
                      <button className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-200">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Flag className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-[12px] font-medium text-slate-200">
                            归一化键：<code className="rounded bg-slate-900/50 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">{normalizedKey}</code>
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {conflict.variants.map((v) => (
                            <span
                              key={v}
                              className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-900/40 px-1.5 py-0.5 text-[10.5px] text-slate-300"
                            >
                              "{v}"
                              <span className="ml-0.5 text-[9.5px] text-slate-500">
                                ({conflict.batchIdsByVariant[v]?.length ?? 0} 批)
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Hash className="h-3 w-3" />
                        共 {totalBatches} 个批次
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-700/40 bg-slate-900/30 px-4 py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {conflict.variants.map((v) => (
                            <div
                              key={v}
                              className="rounded-md border border-slate-700/50 bg-slate-800/50 px-3 py-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-slate-200">
                                  "{v}"
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {conflict.batchIdsByVariant[v]?.length ?? 0} 批次
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(conflict.batchIdsByVariant[v] ?? []).slice(0, 6).map((bid) => (
                                  <span
                                    key={bid}
                                    className="rounded bg-slate-900/50 px-1 py-0.5 font-mono text-[9.5px] text-sky-300"
                                  >
                                    {bid}
                                  </span>
                                ))}
                                {(conflict.batchIdsByVariant[v]?.length ?? 0) > 6 && (
                                  <span className="text-[9.5px] text-slate-500">
                                    +{(conflict.batchIdsByVariant[v]?.length ?? 0) - 6}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2.5 space-y-2.5">
                          <div className="text-[11px] text-slate-300">
                            合并为规范名称（可选）：
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={customName}
                              onChange={(e) =>
                                setCustomNames((prev) => ({
                                  ...prev,
                                  [conflict.id]: e.target.value,
                                }))
                              }
                              placeholder={`留空则使用第一个变体：${conflict.variants[0]}`}
                              className="flex-1 h-8 rounded-md border border-slate-600 bg-slate-900/60 px-2.5 text-[11.5px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none"
                            />
                            <button
                              onClick={() => handleMerge(conflict, true)}
                              className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-400"
                            >
                              <Check className="h-3 w-3" />
                              合并
                            </button>
                          </div>
                          <div className="flex gap-2">
                            {conflict.variants.map((v) => (
                              <button
                                key={v}
                                onClick={() => handleMerge(conflict, false)}
                                className={cn(
                                  'flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10.5px] text-slate-300 transition',
                                  'hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300',
                                )}
                              >
                                使用 "{v}"
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleKeepSeparate(conflict)}
                            className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <XCircle className="h-3 w-3" />
                            保留为独立供应商
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 bg-slate-800/30 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-4 py-1.5 text-[11.5px] text-slate-300 transition hover:border-slate-500 hover:text-slate-200"
          >
            {conflicts.length === 0 ? '关闭' : '稍后处理'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierNameConflictModal;
