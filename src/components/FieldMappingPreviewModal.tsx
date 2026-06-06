import { useState, useMemo, useEffect } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  AlertCircle,
  Save,
  RefreshCw,
  FileText,
  Database,
  ChevronDown,
  ChevronUp,
  Wand2,
  History,
} from 'lucide-react';
import type { FC } from 'react';
import type { FieldMappingPreview, FieldMapping, ColumnMappingSnapshot, FileType } from '@/types';
import { FIELD_LABELS } from '@/types';
import {
  validateMappings,
  autoMatchField,
  saveFieldMappings,
  applySavedMappings,
  checkSavedMappingOutdated,
} from '@/services/csvService';
import { cn } from '@/lib/utils';

interface FieldMappingPreviewModalProps {
  open: boolean;
  onClose: () => void;
  preview: FieldMappingPreview | null;
  onConfirm: (mappings: FieldMapping[]) => Promise<void>;
}

const FILE_TYPE_LABEL: Record<FileType, string> = {
  arrival: '到货清单',
  log: '温度日志',
  review: '复核记录',
};

const FieldMappingPreviewModal: FC<FieldMappingPreviewModalProps> = ({
  open,
  onClose,
  preview,
  onConfirm,
}) => {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (preview) {
      setMappings(preview.mappings.map((m) => ({ ...m })));
    }
  }, [preview]);

  const validation = useMemo(() => validateMappings(mappings), [mappings]);

  const labels = preview ? FIELD_LABELS[preview.fileType] : {};

  const handleSelectColumn = (targetField: string, sourceColumn: string | null) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.targetField === targetField
          ? { ...m, sourceColumn, matchedAutomatically: false, matchReason: sourceColumn ? '手动选择' : undefined }
          : m,
      ),
    );
  };

  const handleAutoMatch = () => {
    if (!preview) return;
    const newMappings = autoMatchField(preview.fileType, preview.headers);
    setMappings(newMappings);
  };

  const handleApplySaved = () => {
    if (!preview) return;
    const autoMappings = autoMatchField(preview.fileType, preview.headers);
    const { mappings: applied } = applySavedMappings(preview.fileType, autoMappings, preview.headers);
    setMappings(applied);
  };

  const handleSaveMapping = () => {
    if (!preview) return;
    const snapshot: ColumnMappingSnapshot[] = mappings.map((m) => ({
      targetField: m.targetField,
      sourceColumn: m.sourceColumn,
    }));
    saveFieldMappings(preview.fileType, snapshot);
  };

  const handleConfirm = async () => {
    if (!validation.canProceed) return;
    setConfirming(true);
    try {
      handleSaveMapping();
      await onConfirm(mappings);
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  const getMappedPreviewRows = () => {
    if (!preview) return [];
    return preview.previewRows.map((row, idx) => {
      const mapped: Record<string, { value: unknown; source: string | null }> = {};
      for (const m of mappings) {
        mapped[m.targetField] = {
          value: m.sourceColumn ? row[m.sourceColumn] : null,
          source: m.sourceColumn,
        };
      }
      return { idx, mapped };
    });
  };

  if (!open || !preview) return null;

  const mappedPreviewRows = getMappedPreviewRows();
  const savedCheck = checkSavedMappingOutdated(preview.fileType, preview.headers);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10">
              <Database className="h-4.5 w-4.5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">字段映射预览 · {FILE_TYPE_LABEL[preview.fileType]}</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                文件: <span className="font-mono text-slate-300">{preview.fileName}</span> ·
                共 {preview.headers.length} 列 · 预览 {preview.previewRows.length} 行数据
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

        {(validation.conflicts.length > 0 || validation.missingRequired.length > 0 || preview.savedMappingOutdated) && (
          <div className="space-y-2 border-b border-slate-700/60 bg-slate-950/40 px-5 py-3">
            {preview.savedMappingOutdated && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <History className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">保存的映射已部分失效：</span>
                  以下字段在当前 CSV 中找不到对应列：
                  {savedCheck.outdatedFields.map((f) => labels[f] || f).join('、')}
                  。请手动重新选择或使用自动匹配。
                </div>
              </div>
            )}
            {validation.missingRequired.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">缺少必填字段：</span>
                  {validation.missingRequired.join('、')}
                  。请为这些字段选择对应的 CSV 列。
                </div>
              </div>
            )}
            {validation.conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-[11px] text-orange-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">映射冲突：</span>
                  {validation.conflicts.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                  同一列不能同时映射到多个字段。
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handleAutoMatch}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-200"
            >
              <Wand2 className="h-3 w-3" />
              自动匹配
            </button>
            {preview.savedMappingAvailable && (
              <button
                onClick={handleApplySaved}
                className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-200"
              >
                <History className="h-3 w-3" />
                恢复上次映射
              </button>
            )}
            <button
              onClick={handleSaveMapping}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              <Save className="h-3 w-3" />
              保存映射为默认
            </button>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                已匹配 {mappings.filter((m) => m.sourceColumn).length}
              </span>
              <span className="text-slate-600">/</span>
              <span className="inline-flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', mappings.filter((m) => m.isRequired && !m.sourceColumn).length > 0 ? 'bg-red-400' : 'bg-emerald-400')} />
                必填 {mappings.filter((m) => m.isRequired).length - mappings.filter((m) => m.isRequired && m.sourceColumn).length} 未填
              </span>
            </div>
          </div>

          <div className="mb-4 overflow-hidden rounded-lg border border-slate-700/60">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium text-slate-400">#</th>
                  <th className="px-3 py-2 font-medium text-slate-400">目标字段</th>
                  <th className="px-3 py-2 font-medium text-slate-400">类型</th>
                  <th className="px-3 py-2 font-medium text-slate-400">CSV 源列</th>
                  <th className="px-3 py-2 font-medium text-slate-400">匹配方式</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {mappings.map((m, idx) => {
                  const isConflict = validation.conflicts.some((c) =>
                    m.sourceColumn && c.includes(`"${m.sourceColumn}"`),
                  );
                  return (
                    <tr
                      key={m.targetField}
                      className={cn(
                        'transition',
                        m.isRequired && !m.sourceColumn ? 'bg-red-500/5' : '',
                        isConflict ? 'bg-orange-500/5' : '',
                      )}
                    >
                      <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-200">{labels[m.targetField] || m.targetField}</span>
                          {m.isRequired && (
                            <span className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[9px] text-red-300">必填</span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-500">{m.targetField}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {m.targetField.toLowerCase().includes('temp') || m.targetField.toLowerCase().includes('quantity')
                          ? '数字'
                          : m.targetField.toLowerCase().includes('time') || m.targetField.toLowerCase().includes('date') || m.targetField.toLowerCase().includes('timestamp')
                          ? '日期'
                          : '文本'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <select
                            value={m.sourceColumn || ''}
                            onChange={(e) => handleSelectColumn(m.targetField, e.target.value || null)}
                            className={cn(
                              'w-full appearance-none rounded-md border bg-slate-950/60 px-2.5 py-1.5 pr-7 text-[11px] text-slate-200 focus:outline-none focus:ring-1',
                              isConflict
                                ? 'border-orange-500/40 focus:border-orange-500 focus:ring-orange-500/30'
                                : m.isRequired && !m.sourceColumn
                                ? 'border-red-500/40 focus:border-red-500 focus:ring-red-500/30'
                                : m.sourceColumn
                                ? 'border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500/30'
                                : 'border-slate-600 focus:border-sky-500 focus:ring-sky-500/30',
                            )}
                          >
                            <option value="">— 未映射 —</option>
                            {preview.headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {m.sourceColumn ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
                              m.matchedAutomatically
                                ? 'border border-sky-500/30 bg-sky-500/10 text-sky-300'
                                : 'border border-purple-500/30 bg-purple-500/10 text-purple-300',
                            )}
                          >
                            {m.matchedAutomatically ? (
                              <>
                                <RefreshCw className="h-2.5 w-2.5" />
                                自动
                              </>
                            ) : (
                              <>
                                <Check className="h-2.5 w-2.5" />
                                手动
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">—</span>
                        )}
                        {m.matchReason && (
                          <div className="mt-0.5 text-[10px] text-slate-500">{m.matchReason}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <button
              onClick={() => setShowPreview((s) => !s)}
              className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <FileText className="h-3 w-3" />
              数据预览（前 {preview.previewRows.length} 行）
            </button>
            {showPreview && (
              <div className="overflow-hidden rounded-lg border border-slate-700/60">
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-[10.5px]">
                    <thead className="sticky top-0 bg-slate-800/80 backdrop-blur-sm">
                      <tr>
                        <th className="w-10 px-3 py-2 font-medium text-slate-400">#</th>
                        {mappings.filter((m) => m.sourceColumn).map((m) => (
                          <th key={m.targetField} className="px-3 py-2 font-medium text-slate-300 whitespace-nowrap">
                            {labels[m.targetField] || m.targetField}
                            <div className="font-mono text-[9px] font-normal text-slate-500">← {m.sourceColumn}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40 font-mono">
                      {mappedPreviewRows.map(({ idx, mapped }) => (
                        <tr key={idx}>
                          <td className="px-3 py-1.5 text-slate-500">{idx + 2}</td>
                          {mappings.filter((m) => m.sourceColumn).map((m) => (
                            <td key={m.targetField} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                              {mapped[m.targetField]?.value != null && mapped[m.targetField]?.value !== ''
                                ? String(mapped[m.targetField]?.value)
                                : <span className="text-slate-600">（空）</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 bg-slate-950/40 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800/60 px-3.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700/60"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!validation.canProceed || confirming}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition',
              validation.canProceed
                ? 'border border-sky-500/40 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
                : 'cursor-not-allowed border border-slate-700 bg-slate-800/40 text-slate-500',
            )}
          >
            {confirming ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-sky-400" />
                导入中...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                确认映射并导入
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldMappingPreviewModal;
